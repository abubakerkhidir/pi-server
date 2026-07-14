import { getDb } from "./db.js";

export function getChatEntities(recId) {
  return getDb().prepare("SELECT * FROM chat_entities WHERE record_id = ? ORDER BY seq ASC").all(recId);
}

export function insertChatEntity(params) {
  const db = getDb();
  const INSERT_STMT = `INSERT INTO chat_entities (record_id, session_id, seq, type, content, tool_name, tool_args, tool_result, tool_is_error, is_complete, duration_ms, 
    content_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const result = db.prepare(INSERT_STMT).run(...params);
  return Number(result.lastInsertRowid);
}
