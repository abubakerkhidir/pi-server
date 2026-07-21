import { getDb } from "./db.js";


/**
 * Look up session by ID if it belongs to the user.
 */
export function findUserSession(dbSessionId, userId) {
  return getDb().prepare("SELECT id, pi_session_id, name, created_at, updated_at FROM session_metadata WHERE id = ? AND user_id = ?").get(dbSessionId, userId);
}

/**
 * Verify session belongs to user.
 */
export function verifySessionOwnership(sessionId, userId) {
  return getDb().prepare("SELECT id FROM session_metadata WHERE id = ? AND user_id = ?").get(sessionId, userId);
}

/**
 * Get all sessions for a user with pagination.
 */
export function getUserSessions(userId, limit, offset) {
  const db = getDb();
  const sessions = db.prepare(
    "SELECT id, name, created_at, updated_at FROM session_metadata WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(userId, limit, offset);
  const total = db.prepare("SELECT COUNT(*) AS c FROM session_metadata WHERE user_id = ?").get(userId);
  return { sessions, total: total.c };
}

/**
 * Delete a session by ID if it belongs to the user.
 */
export function deleteUserSession(sessionId, userId) {
  const result = getDb().prepare("DELETE FROM session_metadata WHERE id = ? AND user_id = ?").run(sessionId, userId);
  return result.changes > 0;
}

/**
 * Update session name if it belongs to the user.
 */
export function updateSessionName(sessionId, userId, name) {
  const result = getDb().prepare("UPDATE session_metadata SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(name.trim(), sessionId, userId);
  return result.changes > 0;
}

/**
 * Search sessions by content (user messages and entity content).
 */
export function searchSessions(userId, query) {
  const like = `%${query}%`;
  const sessions = getDb().prepare(`
    SELECT DISTINCT s.id, s.name, s.created_at, s.updated_at
    FROM session_metadata s
    LEFT JOIN chat_records r ON r.session_id = s.id
    LEFT JOIN chat_entities e ON e.record_id = r.id
    WHERE s.user_id = ?
      AND (
        r.user_msg_content LIKE ?
        OR e.content LIKE ?
      )
    ORDER BY s.updated_at DESC
    LIMIT 50
  `).all(userId, like, like);
  return { sessions, total: sessions.length };
}

export function getSessionMeta(piSessionId) {
  return getDb().prepare("SELECT * FROM session_metadata WHERE id = ?").get(piSessionId);
}

export function getSessionMetaByUser(sessionId, usId) {
  return getDb().prepare("SELECT id, name, context_size, context_used, context_percent FROM session_metadata WHERE id = ? AND user_id = ?").get(sessionId, usId);
}

/**
 * Create a new session metadata record.
 */
export function createSessionRecord(dbSessionId, userId, piSessionId, title,sessionFile) {
  const db = getDb();
  db.prepare("INSERT INTO session_metadata (id, user_id, pi_session_id, name,pi_session_file) VALUES (?, ?, ?, ?,?)").run(dbSessionId, userId, piSessionId, title,sessionFile);
}

/**
 * Update session metadata timestamp.
 */
export function updateSessionTimestamp(dbSessionId) {
  const db = getDb();
  db.prepare("UPDATE session_metadata SET updated_at = datetime('now') WHERE id = ?").run(dbSessionId);
}

export function updateCtxWindow(contextWindow, dbSessionId) {
  try {
    const db = getDb();
    db.prepare("UPDATE session_metadata SET context_size = ? WHERE id = ?").run(contextWindow, dbSessionId);
  } catch { }
}

export function updateCtxSizeAndPrecentage(ctxSize, ctxPrcnt, dbSessionId) {
  try {
    const db = getDb();
    db.prepare("UPDATE session_metadata SET context_used = ?, context_percent = ? WHERE id = ?").run(ctxSize, ctxPrcnt, dbSessionId);
  } catch { }
}

export function updateSessionStats(dbSessionId, s) {
  try {
    const db = getDb();
    db.prepare("UPDATE session_metadata SET context_used = ?, context_percent = ?, context_size = ?,total_input=?,total_output=?, total_cache_read=?,total_cache_write=?,total_reasoning=?,total_cost=?  WHERE id = ?")
      .run(s.context_used, s.context_percent,s.context_size,s.total_input,s.total_output,s.total_cache_read,s.total_cache_write,s.total_reasoning,s.total_cost, dbSessionId);
  } catch (err){ 
    console.log('update-session-states err: ',err)
  }
}