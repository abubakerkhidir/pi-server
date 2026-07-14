/**
 * One-time cleanup script for migrating from old flat-table schema
 * (chat_messages, thinking_entries, tool_entries) to the new
 * entity-based schema (chat_records, chat_entities).
 *
 * Usage: node src/backend/scripts/cleanup-old-schema.js
 *
 * Safe to run multiple times — idempotent DROP statements.
 */

import { initDb, closeDb, getDb } from "../core/db/db.js";

// Initialise the DB (this also creates new tables)
initDb();
const db = getDb();

console.log("Dropping old tables...");
db.exec(`
  DROP TABLE IF EXISTS chat_messages;
  DROP TABLE IF EXISTS thinking_entries;
  DROP TABLE IF EXISTS tool_entries;
`);

console.log("Removing session metadata that has no chat_records...");
const hasRecords = db.prepare("SELECT COUNT(*) AS c FROM chat_records").get();
if (hasRecords && hasRecords.c > 0) {
  const deleted = db.prepare(`
    DELETE FROM session_metadata WHERE id NOT IN (SELECT DISTINCT session_id FROM chat_records)
  `).run();
  console.log(`Deleted ${deleted.changes} orphaned session(s).`);
} else {
  console.log("No chat_records found — skipping session cleanup.");
}

closeDb();
console.log("Done.");
