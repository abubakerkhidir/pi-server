import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), ".pi-server");
const DB_PATH = path.join(DB_DIR, "pi-server.db");

let db;

/**
 * Create base tables for users and settings.
 */
function createUserTables() {
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
  `);
}

/**
 * Create session metadata table.
 */
function createSessionTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_metadata (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      pi_session_id TEXT,
      pi_session_file TEXT,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_metadata_user ON session_metadata(user_id);
  `);
}

/**
 * Create chat files table.
 */
function createFileTables() {
  //db.exec('DROP TABLE chat_files;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_files (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('upload','download')),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      asset_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (record_id) REFERENCES chat_records(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES session_metadata(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_files_record ON chat_files(record_id);
    CREATE INDEX IF NOT EXISTS idx_chat_files_asset ON chat_files(asset_id);
    CREATE INDEX IF NOT EXISTS idx_chat_files_session ON chat_files(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_files_id ON chat_files(id);
    

  `);
}

/**
 * Create entity-based persistence tables for chat records and entities.
 */
function createEntityTables() {
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

/**
 * Add columns that may not exist in older schemas.
 */
function addMissingColumns() {
  // Users table
  try { db.exec("ALTER TABLE users ADD COLUMN home_dir TEXT"); } catch {}

  // Entity duration/content length
  try { db.exec("ALTER TABLE chat_entities ADD COLUMN duration_ms INTEGER"); } catch {}
  try { db.exec("ALTER TABLE chat_entities ADD COLUMN content_length INTEGER"); } catch {}

  // Token stats columns
  try { db.exec("ALTER TABLE chat_records ADD COLUMN prompt_tokens INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN think_tokens INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN output_tokens INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN prompt_token_s INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN output_token_s INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN duration_ms INTEGER"); } catch {}
  try { db.exec("ALTER TABLE chat_records ADD COLUMN ttft_ms INTEGER"); } catch {}

  // Session-level context size
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN context_size INTEGER"); } catch {}
  // Context usage from pi SDK
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN context_used INTEGER"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN context_percent REAL"); } catch {}
//total_input=?,total_output=?, total_cache_read=?,total_cache_write=?,total_reasoning=?,total_cost=?
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_input INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_output INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_cache_read INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_cache_write INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_reasoning INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN total_cost DOUBLE DEFAULT 0"); } catch {}

  // Session file path for loading sessions after restart
  try { db.exec("ALTER TABLE session_metadata ADD COLUMN pi_session_file TEXT"); } catch {}

  // Generated file tracking columns
  try { db.exec("ALTER TABLE chat_files ADD COLUMN tool_name TEXT"); } catch {}
  try { db.exec("ALTER TABLE chat_files ADD COLUMN chat_entity_id INTEGER"); } catch {}
  try { db.exec("ALTER TABLE chat_files ADD COLUMN asset_id TEXT"); } catch {}
}

/**
 * Create all database tables and add missing columns.
 */
function createTables() {
  createUserTables();
  createSessionTables();
  createFileTables();
  createEntityTables();
  addMissingColumns();
}

export function initDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createTables();
  return db;
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
