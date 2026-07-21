import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { getUserById } from "../core/db/user-dao.js";

const USERS_DIR = path.join(os.homedir(), ".pi-server", "users");

/**
 * Get the user's upload directory.
 */
function getUserUploadDir(userId) {
  const user = getUserById(userId);
  const userDir = user?.home_dir || path.join(USERS_DIR, user?.username || "default");
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
