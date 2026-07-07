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

    CREATE TABLE IF NOT EXISTS chat_files (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('upload','download')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (record_id) REFERENCES chat_records(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_files_record ON chat_files(record_id);
  `);

  try {
    db.exec("ALTER TABLE users ADD COLUMN home_dir TEXT");
  } catch {
    // Column already exists
  }

  // ── Add duration/content_length columns to chat_entities ──
  try { db.exec("ALTER TABLE chat_entities ADD COLUMN duration_ms INTEGER"); } catch {}
  try { db.exec("ALTER TABLE chat_entities ADD COLUMN content_length INTEGER"); } catch {}

  // ── Entity-based persistence tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_msg_content TEXT NOT NULL,
      agent_reply_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('think','msg','tool')),
      content TEXT,
      tool_name TEXT,
      tool_args TEXT,
      tool_result TEXT,
      tool_is_error INTEGER DEFAULT 0,
      is_complete INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (record_id) REFERENCES chat_records(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_records_session ON chat_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_entities_record ON chat_entities(record_id);
  `);
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
