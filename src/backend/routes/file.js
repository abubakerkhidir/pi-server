import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import { getFileById, getAllFilesPaginated, deleteFileById } from "../core/db/chat-files-dao.js";

const router = Router();

// GET /api/chat/file/:id — download a file (auth required, owner only)
router.get("/chat/file/:id", authMiddleware, (req, res) => {
  const file = getFileById(req.params.id, req.user.userId);
  if (!file) return res.status(404).json({ error: "File not found" });
  if (!fs.existsSync(file.file_path)) {
    return res.status(404).json({ error: "File no longer exists on disk" });
  }
  res.download(file.file_path, file.file_name);
});

// GET /api/files — paginated list of user's session files
router.get("/files", authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const search = req.query.search || null;
  const type = req.query.type || null;

  const result = getAllFilesPaginated({ page, limit, search, type, userId: req.user.userId });
  res.json(result);
});

// DELETE /api/files/:id — delete file record and physical file (owner only)
router.delete("/files/:id", authMiddleware, (req, res) => {
  const row = deleteFileById(req.params.id, req.user.userId);
  if (!row) return res.status(404).json({ error: "File not found" });
  try { if (fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path); } catch {}
  res.json({ ok: true });
});

export default router;

