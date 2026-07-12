import { Router } from "express";
import fs from "fs";
import { authMiddleware } from "../../middleware/auth.js";
import { getDb } from "../../core/db.js";

const router = Router();

//  GET /api/chat/file/:id — download an uploaded file. authMiddleware,
router.get("/chat/file/:id",  (req, res) => {
  const db = getDb();
  const file = db.prepare(
    `SELECT f.*, r.session_id FROM chat_files f
     JOIN chat_records r ON r.id = f.record_id
     JOIN session_metadata s ON s.id = r.session_id
     WHERE f.id = ? AND s.user_id = ?`
  ).get(req.params.id, req.user.userId);

  if (!file) return res.status(404).json({ error: "File not found" });

  if (!fs.existsSync(file.file_path)) {
    return res.status(404).json({ error: "File no longer exists on disk" });
  }

  res.download(file.file_path, file.file_name);
});

export default router;
