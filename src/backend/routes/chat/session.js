import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { getDb } from "../../core/db.js";
import { getPiManager } from "./stream/state.js";

const router = Router();

/**
 * Look up session by ID if it belongs to the user.
 */
function findUserSession(dbSessionId, userId) {
  const db = getDb();
  return db.prepare(
    "SELECT id, pi_session_id, name, created_at, updated_at FROM session_metadata WHERE id = ? AND user_id = ?"
  ).get(dbSessionId, userId);
}

/**
 * Verify session belongs to user.
 */
function verifySessionOwnership(sessionId, userId) {
  const db = getDb();
  return db.prepare(
    "SELECT id FROM session_metadata WHERE id = ? AND user_id = ?"
  ).get(sessionId, userId);
}

/**
 * Get or load a pi session.
 */
async function loadPiSession(userId, sessionId) {
  const piManager = getPiManager();
  const result = await piManager.getOrCreateSession(userId, sessionId);
  return result.session;
}

/**
 * Check if session has any messages.
 */
function hasMessages(session) {
  return session?.messages && session.messages.length > 0;
}

/**
 * Extract text content from a message.
 */
function extractMessageText(message) {
  let contentItems = [];
  if (Array.isArray(message.content)) {
    contentItems = message.content;
  } else if (message.content && typeof message.content === "object") {
    contentItems = Object.values(message.content);
  } else if (typeof message.content === "string") {
    contentItems = [{ type: "text", text: message.content }];
  }

  return contentItems
    .filter(c => c && c.type === "text")
    .map(c => c.text)
    .join(" ");
}

/**
 * Create a manual summary from session messages.
 */
function createManualSummary(session) {
  const messages = session.messages || [];
  const summaryParts = [];

  for (const msg of messages) {
    const role = msg.role;
    if (role === "user" || role === "assistant") {
      const text = extractMessageText(msg);
      if (text.trim()) {
        summaryParts.push(`${role}: ${text.substring(0, 500)}`);
      }
    } else if (msg.type === "tool") {
      summaryParts.push(`Tool: ${msg.tool}(${JSON.stringify(msg.args || {}).substring(0, 200)})`);
    }
  }

  console.log('sumParts:', summaryParts.length);
  if (summaryParts.length > 0) {
    return "Previous conversation summary:\n" + summaryParts.join("\n");
  }
  return "";
}

/**
 * Try to compact session using pi's built-in compaction.
 */
async function tryCompactSession(session) {
  const result = await session.compact(
    "Provide a comprehensive summary of the entire conversation. Focus on: what the user was trying to accomplish, key decisions and progress, important files/code changes, and any pending tasks."
  );
  const summary = result.summary || "";
  console.log("Compaction result:", summary.substring(0, 100) + "...");
  return summary;
}

/**
 * Summarize a session using pi's compaction or manual fallback.
 */
async function summarizeSession(session) {
  // Try pi's built-in compaction first
  try {
    return await tryCompactSession(session);
  } catch (compactErr) {
    // If compaction fails (e.g., session too small), create manual summary
    console.warn("Compaction failed, creating manual summary:", compactErr.message);
    return createManualSummary(session);
  }
}

//  POST /api/chat/session — lookup session by id
router.post("/chat/session", authMiddleware, (req, res) => {
  const { sessionId: dbSessionId } = req.body;

  if (dbSessionId) {
    const session = findUserSession(dbSessionId, req.user.userId);
    if (session) {
      return res.json({ sessionId: session.id });
    }
  }

  res.json({ sessionId: null });
});

//  POST /api/chat/session/:id/summarize — summarize a session and return the summary text
router.post("/chat/session/:id/summarize", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // Verify session belongs to user
    const meta = verifySessionOwnership(id, req.user.userId);
    if (!meta) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Get or load the pi session
    let piSession;
    try {
      piSession = await loadPiSession(req.user.userId, id);
    } catch (err) {
      console.warn("Failed to load pi session:", err.message);
      return res.json({ summary: "" });
    }

    if (!piSession || !hasMessages(piSession)) {
      return res.json({ summary: "" });
    }

    console.log("Summarizing pi session:", id, "messages:", piSession.messages.length);

    const summary = await summarizeSession(piSession);
    res.json({ summary });
  } catch (err) {
    console.error("Summarization failed:", err.message);
    res.json({ summary: "", error: err.message });
  }
});

export default router;
