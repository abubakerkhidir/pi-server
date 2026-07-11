import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getDb } from "../core/db.js";

const router = Router();

/**
 * Get all sessions for a user with pagination.
 */
function getUserSessions(userId, limit, offset) {
  const db = getDb();
  const sessions = db.prepare(
    "SELECT id, name, created_at, updated_at FROM session_metadata WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(userId, limit, offset);

  const total = db.prepare(
    "SELECT COUNT(*) AS c FROM session_metadata WHERE user_id = ?"
  ).get(userId);

  return { sessions, total: total.c };
}

/**
 * Delete a session by ID if it belongs to the user.
 */
function deleteUserSession(sessionId, userId) {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM session_metadata WHERE id = ? AND user_id = ?"
  ).run(sessionId, userId);

  return result.changes > 0;
}

/**
 * Update session name if it belongs to the user.
 */
function updateSessionName(sessionId, userId, name) {
  const db = getDb();
  const result = db.prepare(
    "UPDATE session_metadata SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name.trim(), sessionId, userId);

  return result.changes > 0;
}

/**
 * Search sessions by content (user messages and entity content).
 */
function searchSessions(userId, query) {
  const db = getDb();
  const like = `%${query}%`;

  const sessions = db.prepare(`
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

//  GET /api/sessions — list all sessions for user
router.get("/sessions", authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const { sessions, total } = getUserSessions(req.user.userId, limit, offset);
  res.json({ sessions, total });
});

//  DELETE /api/sessions/:id — delete a session
router.delete("/sessions/:id", authMiddleware, (req, res) => {
  const deleted = deleteUserSession(req.params.id, req.user.userId);
  if (!deleted) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ ok: true });
});

//  PUT /api/sessions/:id/name — update session name
router.put("/sessions/:id/name", authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }

  const updated = updateSessionName(req.params.id, req.user.userId, name);
  if (!updated) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ ok: true });
});

//  GET /api/sessions/search — full-text search across all chat history
router.get("/sessions/search", authMiddleware, (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    return res.json({ sessions: [], total: 0 });
  }

  const { sessions, total } = searchSessions(req.user.userId, q);
  res.json({ sessions, total });
});

export default router;
