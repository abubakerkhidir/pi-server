import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getChatFilesByRec } from "../core/db/chat-files-dao.js";
import { getChatEntities } from "../core/db/chat-entities-dao.js";
import { getChatRecordsBySession, getChatRecordsBySessionPaginated } from "../core/db/chat-record-dao.js";
import { getSessionMetaByUser } from "../core/db/session-dao.js";

const router = Router();

/**
 * Parse a think entity from database row.
 */
function parseThinkEntity(entity) {
  return {type: 'think', content: entity.content, duration: entity.duration_ms ? Math.round(entity.duration_ms / 1000) : undefined, totalLength: entity.content_length || (entity.content || '').length};
}

/**
 * Parse a message entity from database row.
 */
function parseMessageEntity(entity) {
  return { type: 'msg', content: normalizeMessageContent(entity.content || '') };
}

/**
 * Repair raw HTML tags that were streamed with the closing bracket on its own line.
 * This keeps assistant-rendered image tags valid without changing the stored text.
 */
function normalizeMessageContent(content) {
  return content
    .replace(/(<[A-Za-z][^<>]*?)\s*\/\s*\n\s*>/g, '$1 />')
    .replace(/(<[A-Za-z][^<>]*?)\s*\n\s*>/g, '$1>');
}

/**
 * Parse a tool entity from database row.
 */
function parseToolEntity(entity) {
  let args = {};
  let result = null;
  try { args = JSON.parse(entity.tool_args || '{}'); } catch {}
  try { result = JSON.parse(entity.tool_result || 'null'); } catch {}
  return {type: 'tool',name: entity.tool_name,args,result, isError: !!entity.tool_is_error,isComplete: !!entity.is_complete, duration: entity.duration_ms ? Math.round(entity.duration_ms / 1000) : undefined,};
}

/**
 * Parse a compact entity from database row.
 * Content column stores JSON: { summary, tokensBefore, tokensAfter, savedPct }
 */
function parseCompactEntity(entity) {
  let data = {};
  try { data = JSON.parse(entity.content || '{}'); } catch {}
  return {
    type: 'compact',
    summary: data.summary || null,
    tokensBefore: data.tokensBefore ?? null,
    tokensAfter: data.tokensAfter ?? null,
    savedPct: data.savedPct ?? null,
    duration: entity.duration_ms ?? null,
  };
}

/**
 * Parse a turn entity from database row.
 * Content column stores JSON with turn stats.
 */
function parseTurnEntity(entity) {
  let data = {};
  try { data = JSON.parse(entity.content || '{}'); } catch {}
  return {
    type: 'turn',
    turn: data.turn ?? 0,
    prompt_tokens: data.prompt_tokens ?? 0,
    output_tokens: data.output_tokens ?? 0,
    think_tokens: data.think_tokens ?? 0,
    cache_read: data.cache_read ?? 0,
    cache_write: data.cache_write ?? 0,
    ttft_ms: data.ttft_ms ?? null,
    duration_ms: data.duration_ms ?? null,
    prompt_per_sec: data.prompt_per_sec ?? null,
    output_per_sec: data.output_per_sec ?? null,
    prompt_ms: data.prompt_ms ?? null,
    predicted_ms: data.predicted_ms ?? null,
    predicted_per_second: data.predicted_per_second ?? null,
    predicted_per_token_ms: data.predicted_per_token_ms ?? null,
    draft_n: data.draft_n ?? 0,
    draft_n_accepted: data.draft_n_accepted ?? 0,
    stop_reason: data.stop_reason ?? 'stop',
    tool_calls_count: data.tool_calls_count ?? 0,
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
      case 'compact': return parseCompactEntity(entity);
      case 'turn':  return parseTurnEntity(entity);
      default:      return null;
    }
  }).filter(Boolean);
}

/**
 * Format token stats from database record.
 */
function formatTokenStats(r) {
  return {prompt_tokens: r.prompt_tokens || 0,think_tokens: r.think_tokens || 0,output_tokens: r.output_tokens || 0,prompt_token_s: r.prompt_token_s || 0, output_token_s: r.output_token_s || 0, ttft_ms: r.ttft_ms || 0,};
}

/**
 * Format files from database rows.
 */
function formatFiles(files) {
  return files.map((f) => ({id: f.id,type: f.type, fileName: f.file_name, fileSize: f.file_size, mimeType: f.mimetype, createdAt: f.created_at}));
}

/**
 * Load records for a session with their entities and files.
 * @param {string} sessionId
 * @param {number|null} limit - Max records to return (null = all)
 * @param {number} offset - Number of newest records to skip
 */
function loadSessionRecords(sessionId, limit = null, offset = 0) {
  let records, total, hasMore;
  if (limit !== null) {
    ({ records, total, hasMore } = getChatRecordsBySessionPaginated(sessionId, limit, offset));
  } else {
    records = getChatRecordsBySession(sessionId);
    total = records.length;
    hasMore = false;
  }
  const result = [];
  for (const rec of records) {
    const entities = getChatEntities(rec.id);
    const files = getChatFilesByRec(rec.id);
    result.push({
      id: rec.id,
      userMsg: { content: rec.user_msg_content },
      agentReply: {id: rec.agent_reply_id || '',entities: parseEntities(entities),tokenStats: formatTokenStats(rec),},
      created_at: rec.created_at,
      files: formatFiles(files),
    });
  }
  return { records: result, total, hasMore };
}

/**
 * Extract token stats from a record (handles both formats).
 */
function extractRecordTokenStats(rec) {
  if (rec.tokenStats) {
    return {prompt: rec.tokenStats.prompt_tokens || 0,think: rec.tokenStats.think_tokens || 0,output: rec.tokenStats.output_tokens || 0};
  }
  return {prompt: rec.prompt_tokens || 0, think: rec.think_tokens || 0, output: rec.output_tokens || 0};
}

//  GET /api/chat/history/:sessionId — load session history
//  Query params: limit (default null=all), offset (default 0)
router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const { sessionId } = req.params;
  const s = getSessionMetaByUser(sessionId, req.user.userId);
  if (!s) return res.status(404).json({ error: "Session not found" });
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
  const { records, total, hasMore } = loadSessionRecords(sessionId, limit, offset);
  const contextSize = s.context_size || 128000;
  let sessionStats = {total_input:s.total_input,total_cache_read:s.total_cache_read,total_cache_write:s.total_cache_write,total_reasoning:s.total_reasoning,
    total_output:s.total_output,context_size:s.context_size,context_used:s.context_used, context_percent:s.context_percent
  }
  res.json({ sessionId: s.id, name: s.name,meta:s, records, sessionStats, total, hasMore });
});

export default router;

