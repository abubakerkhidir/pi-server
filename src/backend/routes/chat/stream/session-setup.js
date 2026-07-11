import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../../core/db.js";
import { generateSessionName } from "../../../utils/generateSessionName.js";

/**
 * Generate a truncated title from the user prompt.
 */
function generateInitialTitle(effectivePrompt) {
  return effectivePrompt.replace(/\n/g, " ").substring(0, 80).trim() || "Chat";
}

/**
 * Create a new session metadata record.
 */
function createSessionRecord(dbSessionId, userId, piSessionId, title) {
  const db = getDb();
  db.prepare(
    "INSERT INTO session_metadata (id, user_id, pi_session_id, name) VALUES (?, ?, ?, ?)"
  ).run(dbSessionId, userId, piSessionId, title);
}

/**
 * Update session metadata timestamp.
 */
function updateSessionTimestamp(dbSessionId) {
  const db = getDb();
  db.prepare("UPDATE session_metadata SET updated_at = datetime('now') WHERE id = ?").run(dbSessionId);
}

/**
 * Initialize or update session metadata.
 * @param {string} dbSessionId - The session ID
 * @param {string} userId - The user ID
 * @param {string} piSessionId - The pi session ID
 * @param {string} effectivePrompt - The user prompt
 */
export function initSessionMetadata(dbSessionId, userId, piSessionId, effectivePrompt) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM session_metadata WHERE id = ?").get(dbSessionId);
  
  if (!existing) {
    const title = generateInitialTitle(effectivePrompt);
    createSessionRecord(dbSessionId, userId, piSessionId, title);
  } else {
    updateSessionTimestamp(dbSessionId);
  }
}

/**
 * Create a new chat record for this exchange.
 * @param {string} dbSessionId - The session ID
 * @param {string} effectivePrompt - The user prompt
 * @returns {string} The new record ID
 */
export function createChatRecord(dbSessionId, effectivePrompt) {
  const db = getDb();
  const recordId = uuidv4();
  db.prepare(
    "INSERT INTO chat_records (id, session_id, user_msg_content) VALUES (?, ?, ?)"
  ).run(recordId, dbSessionId, effectivePrompt);
  return recordId;
}

/**
 * Insert a single file record.
 */
function insertFileRecord(fileInsert, recordId, dbSessionId, file) {
  fileInsert.run(
    uuidv4(),
    recordId,
    dbSessionId,
    file.originalname,
    file.path,
    file.size,
    file.mimetype || "application/octet-stream"
  );
}

/**
 * Save uploaded file metadata to database.
 * @param {string} recordId - The chat record ID
 * @param {string} dbSessionId - The session ID
 * @param {Array} files - Uploaded files
 */
export function saveFileMetadata(recordId, dbSessionId, files) {
  if (!files || files.length === 0) return;
  
  const db = getDb();
  const fileInsert = db.prepare(
    "INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, 'upload', ?, ?, ?, ?)"
  );
  
  for (const f of files) {
    insertFileRecord(fileInsert, recordId, dbSessionId, f);
  }
}

/**
 * Get the message count for a session.
 */
function getSessionMessageCount(dbSessionId) {
  const db = getDb();
  const result = db.prepare(
    "SELECT COUNT(*) AS c FROM chat_records WHERE session_id = ?"
  ).get(dbSessionId);
  return result?.c || 0;
}

/**
 * Update session name in database.
 */
function updateSessionName(dbSessionId, name) {
  const db = getDb();
  db.prepare("UPDATE session_metadata SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, dbSessionId);
}

/**
 * Get session metadata for SSE event.
 */
function getSessionMetadata(dbSessionId) {
  const db = getDb();
  return db.prepare(
    "SELECT id, name, created_at, updated_at FROM session_metadata WHERE id = ?"
  ).get(dbSessionId);
}

/**
 * Generate session name on first exchange.
 * @param {string} dbSessionId - The session ID
 * @param {string} effectivePrompt - The user prompt
 * @param {string} fullText - The full assistant response
 * @param {Function} writeEvent - SSE event writer
 */
export async function generateSessionNameIfNeeded(dbSessionId, effectivePrompt, fullText, writeEvent) {
  const messageCount = getSessionMessageCount(dbSessionId);

  if (messageCount === 1) {
    try {
      const name = await generateSessionName(effectivePrompt, fullText);
      updateSessionName(dbSessionId, name);
      const sessionMeta = getSessionMetadata(dbSessionId);
      writeEvent("session_name", sessionMeta);
    } catch (err) {
      console.error("Session naming failed:", err);
    }
  }
}

/**
 * Store model context size in session metadata.
 * @param {string} dbSessionId - The session ID
 * @param {Object} modelInfo - Model info object
 */
export function storeModelContextSize(dbSessionId, modelInfo) {
  if (modelInfo && modelInfo.input) {
    const db = getDb();
    db.prepare("UPDATE session_metadata SET context_size = ? WHERE id = ?")
      .run(modelInfo.input, dbSessionId);
  }
}
