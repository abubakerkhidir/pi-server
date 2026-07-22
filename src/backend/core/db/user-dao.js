import fs from "fs";
import path from "path";
import os from "os";
import { getDb } from "./db.js";

const USERS_DIR = path.join(os.homedir(), ".pi-server", "users");

export function getUser(userId) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId);
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

export function getUserInitialHomeDirById(userId) {
  return getUserInitialHomeDir(getUser(userId)?.username||'default')
}

export function getUserInitialHomeDir(username) {
  return path.join(USERS_DIR, username);
}