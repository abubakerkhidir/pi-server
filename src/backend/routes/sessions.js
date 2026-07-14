import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getUserSessions, deleteUserSession, updateSessionName, searchSessions } from "../core/db/session-dao.js";

const router = Router();

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
