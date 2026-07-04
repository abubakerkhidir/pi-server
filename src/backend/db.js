import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), ".pi-server");
const DB_PATH = path.join(DB_DIR, "pi-server.db");

let db;

export function initDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createTables();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      home_dir TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_metadata (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      pi_session_id TEXT,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_metadata_user ON session_metadata(user_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

    CREATE TABLE IF NOT EXISTS thinking_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_thinking_session ON thinking_entries(session_id);

    CREATE TABLE IF NOT EXISTS tool_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      tool_call_id TEXT NOT NULL,
      name TEXT NOT NULL,
      args TEXT,
      result TEXT,
      partial_result TEXT,
      is_error INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_entries(session_id);
  `);

  try {
    db.exec("ALTER TABLE users ADD COLUMN home_dir TEXT");
  } catch {
    // Column already exists
  }
}

export function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
