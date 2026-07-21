import fs from "fs";
import path from "path";
import os from "os";
import { getDb } from "./db.js";

const USERS_DIR = path.join(os.homedir(), ".pi-server", "users");

/**
 * Get the user's home directory.
 */
export function getUserHomeDir(userId) {
  const db = getDb();
  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  const userDir = path.join(USERS_DIR, user?.username || "default");
  let sessionCwd = user?.home_dir || userDir;
  try {
    if (!fs.statSync(sessionCwd).isDirectory()) sessionCwd = userDir;
  } catch {
    sessionCwd = userDir;
  }
  return sessionCwd;
}

export function updateHomeDir(home_dir, userId) {
  const db = getDb();
  db.prepare("UPDATE users SET home_dir = ? WHERE id = ?").run(home_dir, userId);
}

export function getUserByUsername(username) {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function insertUser(username, password_hash, home_dir) {
  const db = getDb();
  const result = db.prepare("INSERT INTO users (username, password_hash,home_dir) VALUES (?, ?, ?)").run(username, password_hash, home_dir);
  return result.lastInsertRowid;
}

export function getUserById(idx_chat_files_asset) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}
