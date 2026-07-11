#!/usr/bin/env node

/**
 * Script to link existing pi session files to database records.
 * 
 * This script:
 * 1. Scans ~/.pi/agent/sessions/ for JSONL session files
 * 2. Reads the first line of each file to get the pi session ID and timestamp
 * 3. Finds matching database records by timestamp and user
 * 4. Updates the pi_session_file column in session_metadata
 * 
 * Usage: node scripts/link-sessions.js
 */

import fs from "fs";
import path from "path";
import os from "os";
import { initDb, getDb, closeDb } from "../src/backend/db.js";

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const SESSIONS_DIR = path.join(AGENT_DIR, "sessions");

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  return { dryRun, verbose };
}

function findSessionFiles() {
  const sessionFiles = [];
  
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log("Sessions directory not found:", SESSIONS_DIR);
    return sessionFiles;
  }

  // Scan all subdirectories
  const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(SESSIONS_DIR, d.name));

  for (const dir of dirs) {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => path.join(dir, f));

    for (const file of files) {
      try {
        // Read the first line to get session metadata
        const content = fs.readFileSync(file, "utf-8");
        const firstLine = content.split("\n")[0];
        if (!firstLine) continue;

        const metadata = JSON.parse(firstLine);
        if (metadata.type !== "session" || !metadata.id || !metadata.timestamp) {
          continue;
        }

        sessionFiles.push({
          filePath: file,
          piSessionId: metadata.id,
          timestamp: new Date(metadata.timestamp),
          cwd: metadata.cwd,
        });
      } catch (err) {
        // Skip files that can't be parsed
      }
    }
  }

  return sessionFiles;
}

function findMatchingDbRecord(db, sessionFile, verbose) {
  const { piSessionId, timestamp, cwd } = sessionFile;

  // Extract date and time parts from the session file timestamp (ignore timezone)
  // Format: 2026-07-07T01:08:25.612Z -> 2026-07-07 01:08:25
  const tsStr = timestamp.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  
  // Try to find a matching record by timestamp (within 10 seconds tolerance)
  const toleranceSeconds = 10;
  
  // First, try to find by exact pi_session_id if it exists
  const byPiId = db.prepare(
    "SELECT id, user_id, pi_session_id, pi_session_file, name, created_at FROM session_metadata WHERE pi_session_id = ?"
  ).get(piSessionId);

  if (byPiId) {
    if (verbose) {
      console.log(`  Found by pi_session_id: ${byPiId.id} (${byPiId.name})`);
    }
    return byPiId;
  }

  // Extract username from cwd path
  const cwdParts = cwd.split(path.sep);
  let potentialUsernames = [];
  
  // Check for /users/<username> pattern
  const usersIdx = cwdParts.indexOf("users");
  if (usersIdx !== -1 && usersIdx < cwdParts.length - 1) {
    potentialUsernames.push(cwdParts[usersIdx + 1]);
  }
  
  // Also try the last part of the path (might be the username)
  if (cwdParts.length > 1) {
    potentialUsernames.push(cwdParts[cwdParts.length - 1]);
  }
  
  // Also try the second part (home directory owner)
  if (cwdParts.length > 2) {
    potentialUsernames.push(cwdParts[2]); // /home/<username>
  }

  // Find users by username
  const users = [];
  for (const username of potentialUsernames) {
    const user = db.prepare(
      "SELECT id, username, home_dir FROM users WHERE username = ?"
    ).get(username);
    if (user && !users.find(u => u.id === user.id)) {
      users.push(user);
    }
  }

  // Also find users whose home_dir is a prefix or suffix of the cwd
  const byHomeDir = db.prepare(
    "SELECT id, username, home_dir FROM users WHERE ? LIKE home_dir || '%' OR home_dir LIKE ? || '%'"
  ).all(cwd, cwd);
  for (const user of byHomeDir) {
    if (!users.find(u => u.id === user.id)) {
      users.push(user);
    }
  }

  if (verbose && users.length > 0) {
    console.log(`  Found ${users.length} potential users:`, users.map(u => u.username));
  }

  // Find sessions by user and timestamp
  // Use SQL to compare timestamps without timezone issues
  for (const user of users) {
    // Use datetime() function to normalize timestamps and compare
    const sessions = db.prepare(`
      SELECT id, user_id, pi_session_id, pi_session_file, name, created_at 
      FROM session_metadata 
      WHERE user_id = ? 
      AND ABS(strftime('%s', created_at) - strftime('%s', ?)) <= ?
    `).all(user.id, tsStr, toleranceSeconds);

    if (sessions.length === 1) {
      if (verbose) {
        console.log(`  Found by timestamp: ${sessions[0].id} (${sessions[0].name}) for user ${user.username}`);
      }
      return sessions[0];
    }

    if (sessions.length > 1) {
      // Multiple matches - try to find the closest one
      let bestMatch = null;
      let bestDiff = Infinity;
      for (const session of sessions) {
        // Parse the database timestamp correctly (treat as UTC)
        const sessionTime = new Date(session.created_at.replace(' ', 'T') + 'Z');
        const diff = Math.abs(sessionTime.getTime() - timestamp.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestMatch = session;
        }
      }
      if (bestMatch) {
        if (verbose) {
          console.log(`  Found by closest timestamp: ${bestMatch.id} (${bestMatch.name}) for user ${user.username}`);
        }
        return bestMatch;
      }
    }
  }

  return null;
}

async function main() {
  const { dryRun, verbose } = parseArgs();

  console.log("Linking pi session files to database records...");
  console.log("Sessions directory:", SESSIONS_DIR);
  if (dryRun) {
    console.log("DRY RUN - no changes will be made");
  }
  console.log("");

  // Initialize database
  initDb();
  const db = getDb();

  try {
    // Find all session files
    const sessionFiles = findSessionFiles();
    console.log(`Found ${sessionFiles.length} session files`);
    console.log("");

    let linked = 0;
    let skipped = 0;
    let failed = 0;

    for (const sessionFile of sessionFiles) {
      const { filePath, piSessionId, timestamp } = sessionFile;
      const fileName = path.basename(filePath);

      if (verbose) {
        console.log(`Processing: ${fileName}`);
        console.log(`  Pi Session ID: ${piSessionId}`);
        console.log(`  Timestamp: ${timestamp.toISOString()}`);
      }

      // Check if this session file is already linked
      const existing = db.prepare(
        "SELECT id FROM session_metadata WHERE pi_session_file = ?"
      ).get(filePath);

      if (existing) {
        if (verbose) {
          console.log(`  Already linked to: ${existing.id}`);
        }
        skipped++;
        continue;
      }

      // Find matching database record
      const record = findMatchingDbRecord(db, sessionFile, verbose);

      if (!record) {
        if (verbose) {
          console.log("  No matching database record found");
        }
        failed++;
        continue;
      }

      // Update the database record
      if (dryRun) {
        console.log(`  Would update: ${record.id} (${record.name}) -> ${filePath}`);
      } else {
        try {
          db.prepare(
            "UPDATE session_metadata SET pi_session_id = ?, pi_session_file = ? WHERE id = ?"
          ).run(piSessionId, filePath, record.id);
          console.log(`  Linked: ${record.id} (${record.name}) -> ${filePath}`);
        } catch (err) {
          console.error(`  Failed to update: ${err.message}`);
          failed++;
          continue;
        }
      }

      linked++;
    }

    console.log("");
    console.log("Summary:");
    console.log(`  Linked: ${linked}`);
    console.log(`  Skipped (already linked): ${skipped}`);
    console.log(`  Failed (no match): ${failed}`);

  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
