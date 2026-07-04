import { Router } from "express";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import upload from "../middleware/upload.js";
import { authMiddleware } from "../middleware/auth.js";
import { PiSessionManager, loadUserSettings, saveUserSettings } from "../pi-session.js";
import { getDb } from "../db.js";
import {
  isImageFile,
  isVideoFile,
  extractFrames,
  frameImagesToBase64,
  fileToImageContent,
  cleanupFrameDirs,
} from "../pi-video.js";

const router = Router();

let piManager;

export function setPiManager(manager) {
  piManager = manager;
}

router.post("/chat/stream", authMiddleware, upload.array("files", 20), async (req, res) => {
  const { prompt, sessionId } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const db = getDb();
  const userSettings = loadUserSettings(db, req.user.userId);
  const images = [];

  let videoInfo = null;
  const tempDirs = [];

  try {
    if (req.files && req.files.length > 0) {
      const videoFiles = req.files.filter(isVideoFile);
      const imageFiles = req.files.filter(isImageFile);
      const otherFiles = req.files.filter(f => !isVideoFile(f) && !isImageFile(f));

      for (const vid of videoFiles) {
        const result = await extractFrames(vid.path, 1, 448, 70);
        tempDirs.push(result.dir);
        videoInfo = {
          name: vid.originalname,
          duration: result.duration.toFixed(1) + "s",
          frames: result.count,
        };
        images.push(...frameImagesToBase64(result.files));
      }

      for (const img of imageFiles) {
        images.push(fileToImageContent(img.path, img.mimetype));
      }

      if (otherFiles.length > 0) {
        const fileList = otherFiles.map(f => {
          const savedPath = f.path;
          return `${f.originalname} (saved at: ${savedPath})`;
        }).join(", ");
      }
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    if (videoInfo) {
      res.write(`event: metadata\ndata: ${JSON.stringify({ type: "metadata", frames: images.length, video: videoInfo })}\n\n`);
    }

    let fullText = "";
    let thinkingSeq = 0;
    let toolSeq = 0;

    const { session, piSessionId } = await piManager.getOrCreateSession(
      req.user.userId, sessionId
    );

    const dbSessionId = sessionId || piSessionId;
    const modelInfo = session.model ? { id: session.model.id, name: session.model.name, input: session.model.input, reasoning: session.model.reasoning } : null;

    const existing = db.prepare("SELECT id FROM session_metadata WHERE id = ?").get(dbSessionId);
    if (!existing) {
      const title = prompt.replace(/\n/g, " ").substring(0, 80).trim() || "Chat";
      db.prepare(
        "INSERT INTO session_metadata (id, user_id, pi_session_id, name) VALUES (?, ?, ?, ?)"
      ).run(dbSessionId, req.user.userId, piSessionId, title);
    } else {
      db.prepare("UPDATE session_metadata SET updated_at = datetime('now') WHERE id = ?").run(dbSessionId);
    }

    const msgId = uuidv4();
    const fileInfo = req.files?.length ? req.files.map(f => f.originalname).join(", ") : "";
    db.prepare("INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)").run(
      msgId, dbSessionId, "user",
      prompt + (fileInfo ? `\n[Attached files: ${fileInfo}]` : "")
    );

    let promptImageCount = images.length;
    let promptText = prompt;

    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: dbSessionId, model: modelInfo })}\n\n`);

    req.on("close", () => {
      piManager.abort(piSessionId).catch(() => {});
    });

    await piManager.prompt(piSessionId, promptText, {
      images: promptImageCount > 0 ? images : undefined,
      onEvent: (event) => {
        switch (event.type) {
          case "text":
            fullText += event.content;
            res.write(`event: text\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
            break;
          case "thinking":
            thinkingSeq++;
            db.prepare("INSERT INTO thinking_entries (id, session_id, seq, content) VALUES (?, ?, ?, ?)").run(
              uuidv4(), dbSessionId, thinkingSeq, event.content
            );
            res.write(`event: thinking\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
            break;
          case "tool_start":
            toolSeq++;
            db.prepare("INSERT INTO tool_entries (id, session_id, seq, tool_call_id, name, args) VALUES (?, ?, ?, ?, ?, ?)").run(
              uuidv4(), dbSessionId, toolSeq, event.id, event.name, JSON.stringify(event.args || {})
            );
            res.write(`event: tool_start\ndata: ${JSON.stringify({ id: event.id, name: event.name, args: event.args })}\n\n`);
            break;
          case "tool_update":
            {
              const existing = db.prepare("SELECT id FROM tool_entries WHERE session_id = ? AND tool_call_id = ? AND name = ?").get(dbSessionId, event.id, event.name);
              if (existing) {
                const partialStr = typeof event.partialResult === "string" ? event.partialResult : JSON.stringify(event.partialResult || "");
                db.prepare("UPDATE tool_entries SET partial_result = COALESCE(partial_result, '') || ? WHERE id = ?").run(partialStr, existing.id);
              }
            }
            res.write(`event: tool_update\ndata: ${JSON.stringify({ id: event.id, name: event.name, partialResult: event.partialResult })}\n\n`);
            break;
          case "tool_end":
            {
              const existing = db.prepare("SELECT id FROM tool_entries WHERE session_id = ? AND tool_call_id = ? AND name = ?").get(dbSessionId, event.id, event.name);
              if (existing) {
                const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result || "");
                db.prepare("UPDATE tool_entries SET result = ?, is_error = ? WHERE id = ?").run(resultStr, event.isError ? 1 : 0, existing.id);
              }
            }
            res.write(`event: tool_end\ndata: ${JSON.stringify({ id: event.id, name: event.name, args: event.args, result: event.result, isError: event.isError })}\n\n`);
            break;
          case "done": {
            const assistId = uuidv4();
            db.prepare("INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, ?, ?)").run(
              assistId, dbSessionId, "assistant", fullText || "(no text response)"
            );
            res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
            res.end();
            break;
          }
        }
      },
    });
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } finally {
    if (tempDirs.length > 0) {
      setTimeout(() => cleanupFrameDirs(tempDirs), 30000);
    }
  }
});

router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const db = getDb();
  const { sessionId } = req.params;

  const meta = db.prepare("SELECT id, name FROM session_metadata WHERE id = ? AND user_id = ?").get(sessionId, req.user.userId);
  if (!meta) return res.status(404).json({ error: "Session not found" });

  const messages = db.prepare("SELECT id, role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC").all(sessionId);
  const thinking = db.prepare("SELECT seq, content FROM thinking_entries WHERE session_id = ? ORDER BY seq ASC").all(sessionId);
  const tools = db.prepare("SELECT seq, tool_call_id AS id, name, args, result, is_error FROM tool_entries WHERE session_id = ? ORDER BY seq ASC").all(sessionId);
  res.json({ sessionId: meta.id, name: meta.name, messages, thinking, tools });
});

router.post("/chat/session", authMiddleware, (req, res) => {
  const db = getDb();
  const dbSessionId = req.body.sessionId;

  if (dbSessionId) {
    const session = db.prepare(
      "SELECT id, pi_session_id, name, created_at, updated_at FROM session_metadata WHERE id = ? AND user_id = ?"
    ).get(dbSessionId, req.user.userId);
    if (session) {
      return res.json({ sessionId: session.id });
    }
  }

  res.json({ sessionId: null });
});

export default router;
