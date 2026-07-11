import multer from "multer";
import path from "path";
import fs from "fs";
import { getDb } from "../core/db.js";

/**
 * Get the user's upload directory.
 */
function getUserUploadDir(userId) {
  const db = getDb();
  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  const userDir = user?.home_dir || path.join(process.cwd(), "users", user?.username || "default");
  const uploadDir = path.join(userDir, "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

/**
 * Generate a unique filename with timestamp prefix.
 */
function generateUniqueFilename(file) {
  return `${Date.now()}-${file.originalname}`;
}

/**
 * Multer storage that saves uploaded files to the user's directory.
 *
 * Directory structure: <user-home>/uploads/<original-name>
 *
 * Requires authMiddleware to run first so req.user is available.
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadDir = getUserUploadDir(req.user?.userId);
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, generateUniqueFilename(file));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

export default upload;
