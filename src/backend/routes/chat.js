import { Router } from "express";
import fs from "fs";
import path from "path";
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
import { generateSessionName } from "../generateSessionName.js";
import { computeSessionTokenStats } from "../token-stats.js";

const router = Router();

let piManager;

export function setPiManager(manager) {
  piManager = manager;
}

// ─────────────────────────────────────────────────────────
//  POST /api/chat/stream — SSE chat stream
// ─────────────────────────────────────────────────────────
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
    // ── Handle uploaded files (images, video, other) ──
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

    const { session, piSessionId } = await piManager.getOrCreateSession(
      req.user.userId, sessionId
    );

    const dbSessionId = sessionId || piSessionId;

    // ── Diagnostic: log how many history records exist for this session ──
    const historyCount = db.prepare(
      "SELECT COUNT(*) AS c FROM chat_records WHERE session_id = ?"
    ).get(dbSessionId);
    const recordCount = historyCount ? historyCount.c : 0;
    console.log(`[chat] prompt from user, session=${dbSessionId}, history_records=${recordCount}`);
    const modelInfo = session.model
      ? { id: session.model.id, name: session.model.name, input: session.model.input, reasoning: session.model.reasoning }
      : null;

    // ── Session metadata ──
    const existing = db.prepare("SELECT id FROM session_metadata WHERE id = ?").get(dbSessionId);
    if (!existing) {
      const title = prompt.replace(/\n/g, " ").substring(0, 80).trim() || "Chat";
      db.prepare(
        "INSERT INTO session_metadata (id, user_id, pi_session_id, name) VALUES (?, ?, ?, ?)"
      ).run(dbSessionId, req.user.userId, piSessionId, title);
    } else {
      db.prepare("UPDATE session_metadata SET updated_at = datetime('now') WHERE id = ?").run(dbSessionId);
    }

    // ── Create a chat record for this exchange ──
    const recordId = uuidv4();
    db.prepare(
      "INSERT INTO chat_records (id, session_id, user_msg_content) VALUES (?, ?, ?)"
    ).run(recordId, dbSessionId, prompt);

    // ── Save uploaded file metadata ──
    if (req.files && req.files.length > 0) {
      const fileInsert = db.prepare(
        "INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, 'upload', ?, ?, ?, ?)"
      );
      for (const f of req.files) {
        fileInsert.run(uuidv4(), recordId, dbSessionId, f.originalname, f.path, f.size, f.mimetype || "application/octet-stream");
      }
    }

    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: dbSessionId, model: modelInfo, recordId })}\n\n`);

    req.on("close", () => {
      piManager.abort(piSessionId).catch(() => {});
    });

    // ══════════════════════════════════════════════════════
    //  Entity buffering — mirrors frontend useChatStream
    // ══════════════════════════════════════════════════════
    //  Track timing for token stats
    const responseStartTime = Date.now();
    let firstTokenTime = null;      // timestamp when first text/thinking/tool_start arrives
    let usageData = null;           // real usage from pi SDK message_end event

    let entityBuf = [];          // in-memory buffer of entities (think/msg/tool)
    let entitySeq = 0;

    /** Find the last unsealed entity of a given type from the buffer */
    function lastEntity(type) {
      return [...entityBuf].reverse().find((e) => e.type === type && !e.saved);
    }

    /** Persist an entity to DB */
    function saveEntity(entity) {
      if (entity.saved) return;

      // Calculate duration if start time was recorded
      let durationMs = null;
      if (entity.startedAt) {
        durationMs = Date.now() - entity.startedAt;
      }

      // Calculate content length for think entities
      let contentLength = null;
      if (entity.type === 'think' || entity.type === 'msg') {
        contentLength = (entity.content || '').length;
      }

      const stmt = db.prepare(`
        INSERT INTO chat_entities (record_id, session_id, seq, type, content,
                                   tool_name, tool_args, tool_result,
                                   tool_is_error, is_complete,
                                   duration_ms, content_length)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        recordId, dbSessionId, entitySeq++,
        entity.type,
        entity.type === 'think' || entity.type === 'msg' ? entity.content : null,
        entity.type === 'tool' ? entity.toolName : null,
        entity.type === 'tool' ? JSON.stringify(entity.toolArgs ?? {}) : null,
        entity.type === 'tool' ? JSON.stringify(entity.result ?? null) : null,
        entity.type === 'tool' ? (entity.isError ? 1 : 0) : 0,
        entity.type === 'tool' ? (entity.isComplete ? 1 : 0) : 0,
        durationMs,
        contentLength,
      );
      entity.saved = true;
    }

    /** Seal the last unsealed entity of a given type and persist it */
    function sealAndSave(type) {
      const ent = lastEntity(type);
      if (ent && !ent.saved) {
        ent.sealed = true;
        saveEntity(ent);
      }
    }

    await piManager.prompt(piSessionId, prompt, {
      images: images.length > 0 ? images : undefined,
      onEvent: (event) => {
        switch (event.type) {
          // ── Text delta ──
          case "text": {
            if (firstTokenTime === null) firstTokenTime = Date.now();
            fullText += event.content;
            // Seal any open thinking block before appending text
            sealAndSave('think');
            const lastMsg = lastEntity('msg');
            if (lastMsg && !lastMsg.saved) {
              lastMsg.content += event.content;
            } else {
              entityBuf.push({ type: 'msg', content: event.content, saved: false });
            }
            res.write(`event: text\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
            break;
          }

          // ── Thinking delta ──
          case "thinking": {
            if (firstTokenTime === null) firstTokenTime = Date.now();
            const lastThink = lastEntity('think');
            if (lastThink && !lastThink.saved) {
              lastThink.content += event.content;
            } else {
              // Seal previous msg before starting think
              sealAndSave('msg');
              entityBuf.push({
                type: 'think',
                content: event.content,
                startedAt: Date.now(),  // start timing here
                saved: false,
              });
            }
            res.write(`event: thinking\ndata: ${JSON.stringify({ content: event.content })}\n\n`);
            break;
          }

          // ── Tool started ──
          case "tool_start": {
            if (firstTokenTime === null) firstTokenTime = Date.now();
            sealAndSave('think');
            sealAndSave('msg');
            entityBuf.push({
              type: 'tool',
              toolId: event.id,          // tool_call_id for matching updates/end
              toolName: event.name,
              toolArgs: event.args ?? {},
              result: null,
              isError: false,
              isComplete: false,
              startedAt: Date.now(),     // start timing here
              saved: false,
            });
            res.write(`event: tool_start\ndata: ${JSON.stringify({ id: event.id, name: event.name, args: event.args })}\n\n`);
            break;
          }

          // ── Tool partial result ──
          case "tool_update": {
            const tool = entityBuf.find(
              (e) => e.type === 'tool' && e.toolId === event.id && !e.saved
            );
            if (tool) tool.partialResult = event.partialResult;
            res.write(`event: tool_update\ndata: ${JSON.stringify({ id: event.id, name: event.name, partialResult: event.partialResult })}\n\n`);
            break;
          }

          // ── Tool completed ──
          case "tool_end": {
            const tool = entityBuf.find(
              (e) => e.type === 'tool' && e.toolId === event.id && !e.saved
            );
            if (tool) {
              tool.result = event.result;
              tool.isError = !!event.isError;
              tool.isComplete = true;
              saveEntity(tool); // persist immediately — tool is done
            }
            res.write(`event: tool_end\ndata: ${JSON.stringify({ id: event.id, name: event.name, args: event.args, result: event.result, isError: event.isError })}\n\n`);
            break;
          }

          // ── Real token usage from pi SDK ──
          case "usage": {
            usageData = {
              prompt_tokens: event.input || 0,
              output_tokens: event.output || 0,
              think_tokens: event.reasoning || 0,
            };
            break;
          }

          // ── Stream end ──
          case "done": {
            // Save any remaining unsaved entities
            for (const ent of entityBuf) {
              if (!ent.saved) saveEntity(ent);
            }

            // Compute token stats from real usage data or fallback
            const totalDurationMs = Date.now() - responseStartTime;
            const ttftMs = firstTokenTime ? firstTokenTime - responseStartTime : totalDurationMs;

            let promptTokens = 0;
            let thinkTokens = 0;
            let outputTokens = 0;

            if (usageData) {
              // Use real token counts from pi SDK
              promptTokens = usageData.prompt_tokens;
              thinkTokens = usageData.think_tokens;
              outputTokens = usageData.output_tokens;
            } else {
              // Fallback: estimate from content
              promptTokens = Math.ceil(prompt.length / 4);
              for (const ent of entityBuf) {
                if (ent.type === 'think') thinkTokens += Math.ceil((ent.content || '').length / 4);
                if (ent.type === 'msg') outputTokens += Math.ceil((ent.content || '').length / 4);
              }
            }

            // Calculate speeds
            const ttftSec = ttftMs / 1000;
            const generationMs = totalDurationMs - ttftMs;
            const generationSec = generationMs / 1000;

            const promptTokenS = ttftSec > 0 ? Math.round(promptTokens / ttftSec) : 0;
            const outputTokenS = generationSec > 0 ? Math.round(outputTokens / generationSec) : 0;

            const tokenStats = {
              prompt_tokens: promptTokens,
              think_tokens: thinkTokens,
              output_tokens: outputTokens,
              prompt_token_s: promptTokenS,
              output_token_s: outputTokenS,
              ttft_ms: ttftMs,
            };

            // Update record with agent_reply_id and token stats
            db.prepare(
              "UPDATE chat_records SET agent_reply_id = ?, prompt_tokens = ?, think_tokens = ?, output_tokens = ?, prompt_token_s = ?, output_token_s = ?, duration_ms = ?, ttft_ms = ? WHERE id = ?"
            ).run(
              uuidv4(),
              tokenStats.prompt_tokens,
              tokenStats.think_tokens,
              tokenStats.output_tokens,
              tokenStats.prompt_token_s,
              tokenStats.output_token_s,
              totalDurationMs,
              ttftMs,
              recordId,
            );

            // Send token stats event
            res.write(`event: record_stats\ndata: ${JSON.stringify(tokenStats)}\n\n`);
            break;
          }
        }
      },
    });

    // ── Generate session name on first exchange ──
    const userMsgCount = db.prepare(
      "SELECT COUNT(*) AS c FROM chat_records WHERE session_id = ?"
    ).get(dbSessionId);

    if (userMsgCount && userMsgCount.c === 1) {
      try {
        const name = await generateSessionName(prompt, fullText);
        db.prepare("UPDATE session_metadata SET name = ?, updated_at = datetime('now') WHERE id = ?")
          .run(name, dbSessionId);

        const sessionMeta = db.prepare(
          "SELECT id, name, created_at, updated_at FROM session_metadata WHERE id = ?"
        ).get(dbSessionId);

        res.write(`event: session_name\ndata: ${JSON.stringify(sessionMeta)}\n\n`);
      } catch (err) {
        console.error("Session naming failed:", err);
      }
    }

    // ── Store model context size in session metadata ──
    if (modelInfo && modelInfo.input) {
      db.prepare("UPDATE session_metadata SET context_size = ? WHERE id = ?")
        .run(modelInfo.input, dbSessionId);
    }

    // ── Signal completion ──
    if (!res.writableEnded) {
      res.write(`event: done\ndata: ${JSON.stringify({})}\n\n`);
      res.end();
    }
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

// ─────────────────────────────────────────────────────────
//  GET /api/chat/history/:sessionId — load session history
// ─────────────────────────────────────────────────────────
router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const db = getDb();
  const { sessionId } = req.params;

  const meta = db.prepare(
    "SELECT id, name, context_size FROM session_metadata WHERE id = ? AND user_id = ?"
  ).get(sessionId, req.user.userId);
  if (!meta) return res.status(404).json({ error: "Session not found" });

  // ── Load records with entities ──
  const records = db.prepare(
    "SELECT id, user_msg_content, agent_reply_id, created_at, prompt_tokens, think_tokens, output_tokens, prompt_token_s, output_token_s, duration_ms, ttft_ms FROM chat_records WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId);

  const result = [];
  for (const rec of records) {
    // Token stats for this record
    const tokenStats = {
      prompt_tokens: rec.prompt_tokens || 0,
      think_tokens: rec.think_tokens || 0,
      output_tokens: rec.output_tokens || 0,
      prompt_token_s: rec.prompt_token_s || 0,
      output_token_s: rec.output_token_s || 0,
      ttft_ms: rec.ttft_ms || 0,
    };

    // Entities
    const entities = db.prepare(
      "SELECT type, content, tool_name, tool_args, tool_result, tool_is_error, is_complete, duration_ms, content_length FROM chat_entities WHERE record_id = ? ORDER BY seq ASC"
    ).all(rec.id);

    const entityList = entities.map((e) => {
      if (e.type === 'think') {
        return {
          type: 'think',
          content: e.content,
          duration: e.duration_ms ? Math.round(e.duration_ms / 1000) : undefined,
          totalLength: e.content_length || (e.content || '').length,
        };
      }
      if (e.type === 'msg')   return { type: 'msg', content: e.content };
      if (e.type === 'tool') {
        let args = {};
        let result = null;
        try { args = JSON.parse(e.tool_args || '{}'); } catch {}
        try { result = JSON.parse(e.tool_result || 'null'); } catch {}
        return {
          type: 'tool',
          name: e.tool_name,
          args,
          result,
          isError: !!e.tool_is_error,
          isComplete: !!e.is_complete,
          duration: e.duration_ms ? Math.round(e.duration_ms / 1000) : undefined,
        };
      }
      return null;
    }).filter(Boolean);

    // Uploaded files metadata
    const files = db.prepare(
      "SELECT id, type, file_name, file_size, mime_type, created_at FROM chat_files WHERE record_id = ? ORDER BY created_at ASC"
    ).all(rec.id);

    result.push({
      id: rec.id,
      userMsg: { content: rec.user_msg_content },
      agentReply: { id: rec.agent_reply_id || '', entities: entityList, tokenStats },
      created_at: rec.created_at,
      files: files.map((f) => ({
        id: f.id,
        type: f.type,
        fileName: f.file_name,
        fileSize: f.file_size,
        mimeType: f.mime_type,
        createdAt: f.created_at,
      })),
    });
  }

  // Compute session-level token stats
  const contextSize = meta.context_size || 128000;
  const sessionStats = computeSessionTokenStats(records, contextSize);

  res.json({ sessionId: meta.id, name: meta.name, records: result, sessionStats });
});

// ─────────────────────────────────────────────────────────
//  GET /api/chat/file/:id — download an uploaded file
// ─────────────────────────────────────────────────────────
router.get("/chat/file/:id", authMiddleware, (req, res) => {
  const db = getDb();
  const file = db.prepare(
    `SELECT f.*, r.session_id FROM chat_files f
     JOIN chat_records r ON r.id = f.record_id
     JOIN session_metadata s ON s.id = r.session_id
     WHERE f.id = ? AND s.user_id = ?`
  ).get(req.params.id, req.user.userId);

  if (!file) return res.status(404).json({ error: "File not found" });

  if (!fs.existsSync(file.file_path)) {
    return res.status(404).json({ error: "File no longer exists on disk" });
  }

  res.download(file.file_path, file.file_name);
});

// ─────────────────────────────────────────────────────────
//  POST /api/chat/session — lookup session by id
// ─────────────────────────────────────────────────────────
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
