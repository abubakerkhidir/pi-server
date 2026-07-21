import { Router } from "express";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import os from "os";
import { generateToken, authMiddleware } from "../middleware/auth.js";
import { insertUser, getUserByUsername } from "../core/db/user-dao.js";
import { insertSettings } from "../core/db/settings-dao.js";

export const USERS_DIR = path.join(os.homedir(), ".pi-server", "users");

const router = Router();
/**
 * Validate registration input.
 */
function validateRegistration(username, password) {
  if (!username || !password) {
    return { error: "Username and password are required" };
  }
  if (username.length < 3) {
    return { error: "Username must be at least 3 characters" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  return null;
}

/**
 * Check if username is already taken.
 */
function isUsernameTaken(username) {
  const existing = getUserByUsername(username);
  return !!existing;
}

/**
 * Create a new user with home directory and default settings.
 */
export async function createUser(username, password) {
  const password_hash = await bcrypt.hash(password, 12);
  const homeDir = path.join(USERS_DIR, username);
  fs.mkdirSync(homeDir, { recursive: true });
  const userId = insertUser(username, password_hash, homeDir);
  // Create default settings
  insertSettings(getDefaultSettings(), userId);
  return userId;
}

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", path: "/" };

router.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const validationError = validateRegistration(username, password);
  if (validationError) {
    return res.status(400).json(validationError);
  }

  if (isUsernameTaken(username)) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const userId = await createUser(username, password);
  const token = generateToken({ id: userId, username });
  res.cookie("token", token, COOKIE_OPTS);
  res.json({ token, username });
});


router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const user = getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = generateToken({ id: user.id, username: user.username });
  res.cookie("token", token, COOKIE_OPTS);
  res.json({ token, username: user.username });
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

export default router;