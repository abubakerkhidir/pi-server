import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getChatFilesByRec } from "../core/db/chat-files-dao.js";
import { getChatEntities } from "../core/db/chat-entities-dao.js";
import { getChatRecordsBySession } from "../core/db/chat-record-dao.js";
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
 * Parse entities from database rows.
 */
function parseEntities(entities) {
  return entities.map((entity) => {
    switch (entity.type) {
      case 'think': return parseThinkEntity(entity);
      case 'msg':   return parseMessageEntity(entity);
      case 'tool':  return parseToolEntity(entity);
      case 'compact': return parseCompactEntity(entity);
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
 * Load all records for a session with their entities and files.
 */
function loadSessionRecords(sessionId) {
  const records = getChatRecordsBySession(sessionId);
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
  return result;
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
router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const { sessionId } = req.params;
  const s = getSessionMetaByUser(sessionId, req.user.userId);
  if (!s) return res.status(404).json({ error: "Session not found" });
  const records = loadSessionRecords(sessionId);
  const contextSize = s.context_size || 128000;
  let sessionStats = {total_input:s.total_input,total_cache_read:s.total_cache_read,total_cache_write:s.total_cache_write,total_reasoning:s.total_reasoning,
    total_output:s.total_output,context_size:s.context_size,context_used:s.context_used, context_percent:s.context_percent
  }
  res.json({ sessionId: s.id, name: s.name,meta:s, records, sessionStats });
});

export default router;

