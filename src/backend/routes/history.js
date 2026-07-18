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

/**
 * Extract token stats from a record (handles both formats).
 */
function extractRecordTokenStats(rec) {
  if (rec.tokenStats) {
    return {prompt: rec.tokenStats.prompt_tokens || 0,think: rec.tokenStats.think_tokens || 0,output: rec.tokenStats.output_tokens || 0};
  }
  return {prompt: rec.prompt_tokens || 0, think: rec.think_tokens || 0, output: rec.output_tokens || 0};
}

/**
 * Accumulate token stats across all records in a session.
 * @param {Array} records - Array of records each with a tokenStats field
 * @param {number} contextSize - The model's context window size in tokens
 * @returns {Object} { total_prompt, total_think, total_output, context_used_pct, context_size }
 */
function computeSessionTokenStats(records, contextSize) {
  let totalPrompt = 0;
  let totalThink = 0;
  let totalOutput = 0;

  for (const rec of records) {
    const stats = extractRecordTokenStats(rec);
    totalPrompt += stats.prompt;
    totalThink += stats.think;
    totalOutput += stats.output;
  }

  const totalUsed = totalPrompt + totalThink + totalOutput;
  const contextSizeNum = contextSize || 128000;
  const contextUsedPct = contextSizeNum > 0 ? Math.round((totalUsed / contextSizeNum) * 100) : 0;

  return {total_prompt: totalPrompt,total_think: totalThink,total_output: totalOutput,context_used_pct: contextUsedPct,context_size: contextSizeNum};
}

//  GET /api/chat/history/:sessionId — load session history
router.get("/chat/history/:sessionId", authMiddleware, (req, res) => {
  const { sessionId } = req.params;
  const meta = getSessionMetaByUser(sessionId, req.user.userId);
  if (!meta) return res.status(404).json({ error: "Session not found" });
  const records = loadSessionRecords(sessionId);
  const contextSize = meta.context_size || 128000;
  let sessionStats = computeSessionTokenStats(records, contextSize);
  sessionStats = addContextUsage(sessionStats, meta);
  res.json({ sessionId: meta.id, name: meta.name, records, sessionStats });
});

export default router;

