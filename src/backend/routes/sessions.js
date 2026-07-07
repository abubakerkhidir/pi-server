import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getDb } from "../db.js";

const router = Router();

router.get("/sessions", authMiddleware, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const sessions = db.prepare(
    "SELECT id, name, created_at, updated_at FROM session_metadata WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(req.user.userId, limit, offset);

  const total = db.prepare(
    "SELECT COUNT(*) AS c FROM session_metadata WHERE user_id = ?"
  ).get(req.user.userId);

  res.json({ sessions, total: total.c });
});

router.delete("/sessions/:id", authMiddleware, (req, res) => {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM session_metadata WHERE id = ? AND user_id = ?"
  ).run(req.params.id, req.user.userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ ok: true });
});

router.put("/sessions/:id/name", authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Name is required" });
  }

  const db = getDb();
  const result = db.prepare(
    "UPDATE session_metadata SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(name.trim(), req.params.id, req.user.userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ ok: true });
});

//  GET /api/sessions/search — full-text search across all chat history
router.get("/sessions/search", authMiddleware, (req, res) => {
  const db = getDb();
  const q = (req.query.q || "").trim();

  if (!q) {
    return res.json({ sessions: [], total: 0 });
  }

  // Search in user messages and entity content
  const like = `%${q}%`;

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
  `).all(req.user.userId, like, like);

  const total = sessions.length;

  res.json({ sessions, total });
});

export default router;
