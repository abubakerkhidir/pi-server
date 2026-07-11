import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { getDb } from "../../core/db.js";
import { computeSessionTokenStats } from "../../core/token-stats.js";

const router = Router();

/**
 * Parse a think entity from database row.
 */
function parseThinkEntity(entity) {
  return {
    type: 'think',
    content: entity.content,
    duration: entity.duration_ms ? Math.round(entity.duration_ms / 1000) : undefined,
    totalLength: entity.content_length || (entity.content || '').length,
  };
}

/**
 * Parse a message entity from database row.
 */
function parseMessageEntity(entity) {
  return { type: 'msg', content: entity.content };
}

/**
 * Parse a tool entity from database row.
 */
function parseToolEntity(entity) {
  let args = {};
  let result = null;
  try { args = JSON.parse(entity.tool_args || '{}'); } catch {}
  try { result = JSON.parse(entity.tool_result || 'null'); } catch {}

  return {
    type: 'tool',
    name: entity.tool_name,
    args,
    result,
    isError: !!entity.tool_is_error,
    isComplete: !!entity.is_complete,
    duration: entity.duration_ms ? Math.round(entity.duration_ms / 1000) : undefined,
  };
}

/**
 * Parse entities from database rows.
 */
function parseEntities(entities) {
  return entities.map((entity) => {
    switch (entity.type) {
      case 'think': return parseThinkEntity(entity);
      case 'msg':   return parseMessageEntity(entity);
      case 'tool':  return parseToolEntity(entity);
      default:      return null;
    }
  }).filter(Boolean);
}

/**
 * Format token stats from database record.
 */
function formatTokenStats(record) {
  return {
    prompt_tokens: record.prompt_tokens || 0,
    think_tokens: record.think_tokens || 0,
    output_tokens: record.output_tokens || 0,
    prompt_token_s: record.prompt_token_s || 0,
    output_token_s: record.output_token_s || 0,
    ttft_ms: record.ttft_ms || 0,
  };
}

/**
 * Format files from database rows.
 */
function formatFiles(files) {
  return files.map((f) => ({
    id: f.id,
    type: f.type,
    fileName: f.file_name,
    fileSize: f.file_size,
    mimeType: f.mimetype,
    createdAt: f.created_at,
  }));
}

/**
 * Load all records for a session with their entities and files.
 */
function loadSessionRecords(sessionId) {
  const db = getDb();

  const records = db.prepare(
    "SELECT id, user_msg_content, agent_reply_id, created_at, prompt_tokens, think_tokens, output_tokens, prompt_token_s, output_token_s, duration_ms, ttft_ms FROM chat_records WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId);

  const result = [];
  for (const rec of records) {
    const entities = db.prepare(
      "SELECT type, content, tool_name, tool_args, tool_result, tool_is_error, is_complete, duration_ms, content_length FROM chat_entities WHERE record_id = ? ORDER BY seq ASC"
    ).all(rec.id);

    const files = db.prepare(
      "SELECT id, type, file_name, file_size, mime_type, created_at FROM chat_files WHERE record_id = ? ORDER BY created_at ASC"
    ).all(rec.id);

    result.push({
      id: rec.id,
      userMsg: { content: rec.user_msg_content },
      agentReply: {
        id: rec.agent_reply_id || '',
        entities: parseEntities(entities),
        tokenStats: formatTokenStats(rec),
      },
      created_at: rec.created_at,
      files: formatFiles(files),
    });
  }

  return result;
}

/**
 * Add context usage from pi SDK to session stats.
 */
function addContextUsage(sessionStats, meta) {
  if (meta.context_used != null) {
    sessionStats.context_used = meta.context_used;
  }
  if (meta.context_percent != null) {
    sessionStats.context_percent = meta.context_percent;
  }
  return sessionStats;
}

//  GET /api/chat/history/:sessionId — load session history
router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const db = getDb();
  const { sessionId } = req.params;

  const meta = db.prepare(
    "SELECT id, name, context_size, context_used, context_percent FROM session_metadata WHERE id = ? AND user_id = ?"
  ).get(sessionId, req.user.userId);
  if (!meta) return res.status(404).json({ error: "Session not found" });

  const records = loadSessionRecords(sessionId);

  const contextSize = meta.context_size || 128000;
  let sessionStats = computeSessionTokenStats(records, contextSize);
  sessionStats = addContextUsage(sessionStats, meta);

  res.json({ sessionId: meta.id, name: meta.name, records, sessionStats });
});

export default router;
