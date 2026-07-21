import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import { getUserSessions, deleteUserSession, updateSessionName, searchSessions, getSessionMetaByUser } from "../core/db/session-dao.js";
import { getFilesBySession } from "../core/db/chat-files-dao.js";

const router = Router();

//  GET /api/sessions — list all sessions for user
router.get("/sessions", authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  const { sessions, total } = getUserSessions(req.user.userId, limit, offset);
  res.json({ sessions, total });
});

//  DELETE /api/sessions/:id — delete a session and its files
router.delete("/sessions/:id", authMiddleware, (req, res) => {
  const sessionId = req.params.id;
  const userId = req.user.userId;

  // Collect file paths before deletion ( CASCADE will remove DB records )
  const meta = getSessionMetaByUser(sessionId, userId);
  if (!meta) {
    return res.status(404).json({ error: "Session not found" });
  }

  const filePaths = getFilesBySession(sessionId);
  const deleted = deleteUserSession(sessionId, userId);
  if (!deleted) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Delete physical files (best-effort, don't fail the request)
  for (const f of filePaths) {
    if (f.file_path) {
      try { fs.unlinkSync(f.file_path); } catch {}
    }
  }
  // Delete pi session file
  if (meta.pi_session_file) {
    try { fs.unlinkSync(meta.pi_session_file); } catch {}
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
