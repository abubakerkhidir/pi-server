import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import { getFileById } from "../core/db/chat-files-dao.js";

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

export default router;

