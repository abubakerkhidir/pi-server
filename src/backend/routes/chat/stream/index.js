import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.js";
import upload from "../../../middleware/upload.js";
import { cleanupFrameDirs } from "../../../core/pi-video.js";
import { getPiManager } from "./state.js";
import { processUploadedFiles } from "./file-processor.js";
import { createEntityBuffer } from "./entity-buffer.js";
import { createSSEWriter, createStreamEventHandler } from "./handler.js";
import {
  initSessionMetadata,
  createChatRecord,
  saveFileMetadata,
  generateSessionNameIfNeeded,
  storeModelContextSize,
} from "./session-setup.js";

const router = Router();

/**
 * Write SSE metadata event for video info.
 */
function writeVideoMetadata(writeEvent, videoInfo, imageCount) {
  if (videoInfo) {
    writeEvent("metadata", {
      type: "metadata",
      frames: imageCount,
      video: videoInfo,
    });
  }
}

/**
 * Extract model info from pi session model.
 */
function extractModelInfo(session) {
  if (!session.model) return null;
  return {
    id: session.model.id,
    name: session.model.name,
    input: session.model.input,
    reasoning: session.model.reasoning,
  };
}

/**
 * Write session info event with model and record ID.
 */
function writeSessionEvent(writeEvent, dbSessionId, modelInfo, recordId) {
  writeEvent("session", {
    sessionId: dbSessionId,
    model: modelInfo,
    recordId,
  });
}

/**
 * Write error event and close response.
 */
function writeErrorResponse(res, message) {
  if (!res.writableEnded) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
}

/**
 * Write done event and close response.
 */
function writeDoneEvent(writeEvent, res) {
  if (!res.writableEnded) {
    writeEvent("done", {});
    res.end();
  }
}

/**
 * Cleanup temp directories after delay.
 */
function scheduleCleanup(tempDirs) {
  if (tempDirs.length > 0) {
    setTimeout(() => cleanupFrameDirs(tempDirs), 30000);
  }
}

/**
 * Wrap onEvent to track full text for session naming.
 */
function wrapOnEventForNaming(onEvent) {
  let fullText = "";
  const wrappedOnEvent = (event) => {
    if (event.type === "text") fullText += event.content;
    onEvent(event);
  };
  return { wrappedOnEvent, getFullText: () => fullText };
}

//  POST /api/chat/stream — SSE chat stream
router.post("/chat/stream", authMiddleware, upload.array("files", 20), async (req, res) => {
  const piManager = getPiManager();
  const { prompt, sessionId } = req.body;

  if (!prompt && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ error: "Prompt or files are required" });
  }
  const effectivePrompt = prompt || "[File attachment]";

  const images = [];
  let videoInfo = null;
  const tempDirs = [];

  try {
    // Process uploaded files
    const fileResult = await processUploadedFiles(req.files);
    images.push(...fileResult.images);
    videoInfo = fileResult.videoInfo;
    tempDirs.push(...fileResult.tempDirs);

    // Setup SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const writeEvent = createSSEWriter(res);
    writeVideoMetadata(writeEvent, videoInfo, images.length);

    // Get or create session
    const { session, piSessionId } = await piManager.getOrCreateSession(req.user.userId, sessionId);
    const dbSessionId = sessionId || piSessionId;

    // Initialize session and record
    initSessionMetadata(dbSessionId, req.user.userId, piSessionId, effectivePrompt);
    const recordId = createChatRecord(dbSessionId, effectivePrompt);
    saveFileMetadata(recordId, dbSessionId, req.files);

    // Get model info
    const modelInfo = extractModelInfo(session);
    writeSessionEvent(writeEvent, dbSessionId, modelInfo, recordId);

    // Handle abort on client disconnect
    req.on("close", () => {
      piManager.abort(piSessionId).catch(() => {});
    });

    // Create entity buffer and stream handler
    const entityBuffer = createEntityBuffer(recordId, dbSessionId);
    const responseStartTime = Date.now();

    const { onEvent } = createStreamEventHandler({
      writeEvent,
      entityBuffer,
      res,
      dbSessionId,
      recordId,
      responseStartTime,
      userId: req.user.userId,
      req,
    });

    // Track full text for session naming
    const { wrappedOnEvent, getFullText } = wrapOnEventForNaming(onEvent);

    // Run the prompt
    await piManager.prompt(piSessionId, effectivePrompt, {
      images: images.length > 0 ? images : undefined,
      onEvent: wrappedOnEvent,
    });

    // Post-prompt tasks
    await generateSessionNameIfNeeded(dbSessionId, effectivePrompt, getFullText(), writeEvent);
    storeModelContextSize(dbSessionId, modelInfo);

    // Signal completion
    writeDoneEvent(writeEvent, res);
  } catch (err) {
    writeErrorResponse(res, err.message);
  } finally {
    scheduleCleanup(tempDirs);
  }
});

export default router;
