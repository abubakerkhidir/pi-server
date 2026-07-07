import multer from "multer";
import path from "path";
import fs from "fs";
import { getDb } from "../db.js";

/**
 * Multer storage that saves uploaded files to the user's directory.
 *
 * Directory structure: <user-home>/uploads/<recordId>/<original-name>
 *
 * Requires authMiddleware to run first so req.user is available.
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const db = getDb();
    const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(req.user?.userId);
    const userDir = user?.home_dir || path.join(process.cwd(), "users", user?.username || "default");
    const uploadDir = path.join(userDir, "uploads");
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Prefix with timestamp to avoid collisions
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

export default upload;
