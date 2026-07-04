import { Router } from "express";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { getDb } from "./db.js";
import { generateToken, authMiddleware } from "./middleware/auth.js";
import { getDefaultSettings } from "./pi-session.js";

const USERS_DIR = path.join(process.cwd(), "users");

const router = Router();

router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, password_hash);
  const userId = result.lastInsertRowid;

  const homeDir = path.join(USERS_DIR, username);
  fs.mkdirSync(homeDir, { recursive: true });
  db.prepare("UPDATE users SET home_dir = ? WHERE id = ?").run(homeDir, userId);

  const defaults = getDefaultSettings();
  const upsert = db.prepare("INSERT OR IGNORE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)");
  for (const [key, value] of Object.entries(defaults)) {
    upsert.run(userId, key, JSON.stringify(value));
  }

  const token = generateToken({ id: userId, username });
  res.json({ token, username });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const db = getDb();
  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = generateToken({ id: user.id, username: user.username });
  res.json({ token, username: user.username });
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

export default router;
