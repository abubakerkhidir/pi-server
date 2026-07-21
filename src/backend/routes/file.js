import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import { getFileById, getAllFilesPaginated } from "../core/db/chat-files-dao.js";

const router = Router();

//  GET /api/chat/file/:id — download an uploaded file. authMiddleware,
router.get("/chat/file/:id",  (req, res) => {
  const file = getFileById(req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  if (!fs.existsSync(file.file_path)) {
    return res.status(404).json({ error: "File no longer exists on disk" });
  }
  res.download(file.file_path, file.file_name);
});

// GET /api/files — paginated list of all session files with search and type filter
router.get("/files", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const search = req.query.search || null;
  const type = req.query.type || null;

  const result = getAllFilesPaginated({ page, limit, search, type });
  res.json(result);
});

export default router;

