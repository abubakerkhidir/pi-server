import { getDb } from "./db";
import { v4 as uuidv4 } from "uuid";


export function getChatRecordsBySession(sessionId) {
  return getDb().prepare("SELECT * FROM chat_records WHERE session_id = ? ORDER BY created_at ASC").all(sessionId);
}


/**
 * Create a new chat record for this exchange.
 */
export function createChatRecord(dbSessionId, effectivePrompt) {
  const db = getDb();
  const recordId = uuidv4();
  db.prepare("INSERT INTO chat_records (id, session_id, user_msg_content) VALUES (?, ?, ?)").run(recordId, dbSessionId, effectivePrompt);
  return recordId;
}
/**
 * Get the message count for a session.
 */
export function getSessionMessageCount(dbSessionId) {
  const db = getDb();
  const result = db.prepare("SELECT COUNT(*) AS c FROM chat_records WHERE session_id = ?").get(dbSessionId);
  return result?.c || 0;
}export function updateTokenStats(prompt_tokens, think_tokens, output_tokens, prompt_token_s, output_token_s, totalDurationMs, ttft_ms, recordId) {
  const db = getDb();
  db.prepare(
    "UPDATE chat_records SET agent_reply_id = ?, prompt_tokens = ?, think_tokens = ?, output_tokens = ?, prompt_token_s = ?, output_token_s = ?, duration_ms = ?, ttft_ms = ? WHERE id = ?"
  ).run(
    uuidv4(),
    prompt_tokens,
    think_tokens,
    output_tokens,
    prompt_token_s,
    output_token_s,
    totalDurationMs,
    ttft_ms,
    recordId
  );
}

