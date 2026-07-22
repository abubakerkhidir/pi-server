import { authMiddleware } from "../../middleware/auth.js";
import upload from "../../middleware/upload.js";
import { cleanupFrameDirs } from "../video/pi-video.js";
import { getPiManager, removeEntityBuffer, setEntityBuffer } from "./state.js";
import { processUploadedFiles } from "./file-processor.js";
import { createEntityBuffer } from "./entity-buffer.js";
import { createStreamEventHandler } from "./event-handler.js";
import { createSSEWriter, wrapOnEventForNaming, writeDoneEvent, writeErrorResponse, writeSessionEvent, writeVideoMetadata } from "./stream-utils.js";
import {initSessionMetadata,generateSessionNameIfNeeded} from "./session-setup.js";
import { createChatRecord } from "../db/chat-record-dao.js";
import { saveFileMetadata } from "../db/chat-files-dao.js";
import { debug } from "../../utils/logger.js";

/**
 * Cleanup temp directories after delay.
 */
function scheduleCleanup(tempDirs) {
  if (tempDirs.length > 0) {
    setTimeout(() => cleanupFrameDirs(tempDirs), 30000);
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

export async function handleChatStream(req, res){
  const piManager = getPiManager();
  const { prompt, sessionId, provider, model,thinkLevel,homeDir } = req.body;

  if (!prompt && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ error: "Prompt or files are required" });
  }
  const effectivePrompt = prompt || "[File attachment]";

  const images = [];
  let videoInfo = null;
  const tempDirs = [];
  let dbSessionId = undefined
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
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const writeEvent = createSSEWriter(res);
    writeVideoMetadata(writeEvent, videoInfo, images.length);

    // Get or create session
    const { session, piSessionId } = await piManager.getOrCreateSession(req.user.userId, sessionId,provider,model,thinkLevel,homeDir);
    dbSessionId = sessionId || piSessionId;
    console.log('got pi session: ', piSessionId, sessionId, dbSessionId);

    // Initialize session and record
    initSessionMetadata(dbSessionId, req.user.userId, piSessionId, effectivePrompt,session.sessionFile,provider, model,thinkLevel,homeDir );
    const recordId = createChatRecord(dbSessionId, effectivePrompt);
    saveFileMetadata(recordId, dbSessionId, req.files);

    // Get model info
    const modelInfo = extractModelInfo(session);
    writeSessionEvent(writeEvent, dbSessionId, modelInfo, recordId);

    // Handle abort on client disconnect
    req.on("close", () => {piManager.abort(piSessionId).catch(() => { }); removeEntityBuffer(dbSessionId);});

    // Create entity buffer and stream handler
    const entityBuffer = createEntityBuffer(recordId, dbSessionId, req.user.userId);
    setEntityBuffer(dbSessionId, entityBuffer);
    const responseStartTime = Date.now();

    const { onEvent,onAgentEnd, lastEvent } = createStreamEventHandler({ writeEvent, entityBuffer, res, dbSessionId, recordId, responseStartTime, userId: req.user.userId, req, session });

    // Track full text for session naming
    const { wrappedOnEvent, getFullText } = wrapOnEventForNaming(onEvent);

    // Run the prompt
    let startTime = new Date().getTime()
    console.log('running prompt: ',effectivePrompt)
    await piManager.prompt(piSessionId, effectivePrompt, { images: images.length > 0 ? images : undefined, onEvent: wrappedOnEvent});
    
    console.log('prompt completed in pi... ',dbSessionId, new Date().getTime() - startTime)
    await onAgentEnd
    console.log('agent reply completed in pi... ',dbSessionId, new Date().getTime() - startTime)
    
    // Post-prompt tasks
    await generateSessionNameIfNeeded(dbSessionId, effectivePrompt, getFullText(), writeEvent,req);

    debug('session stats: ',session.getSessionStats(), session.getContextUsage())
    
    // Signal completion
    writeDoneEvent(writeEvent, res, lastEvent);
    removeEntityBuffer(dbSessionId);
  } catch (err) {
    console.log('Error in pi session: ',err)
    writeErrorResponse(res, err.message);
  } finally {
    scheduleCleanup(tempDirs);
    removeEntityBuffer(dbSessionId);
  }
}

