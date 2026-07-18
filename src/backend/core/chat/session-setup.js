import { v4 as uuidv4 } from "uuid";
import { generateSessionName } from "../../utils/generateSessionName.js";
import { createSessionRecord, getSessionMeta,  updateSessionName, updateSessionTimestamp } from "../db/session-dao.js";
import { getSessionMessageCount } from "../db/chat-record-dao.js";

/**
 * Generate a truncated title from the user prompt.
 */
function generateInitialTitle(effectivePrompt) {
  return effectivePrompt.replace(/\n/g, " ").substring(0, 80).trim() || "Chat";
}

/**
 * Initialize or update session metadata.
 * @param {string} dbSessionId - The session ID
 * @param {string} userId - The user ID
 * @param {string} piSessionId - The pi session ID
 * @param {string} effectivePrompt - The user prompt
 */
export function initSessionMetadata(dbSessionId, userId, piSessionId, effectivePrompt) {
  const existing = getSessionMeta(dbSessionId);
  if (!existing) {
    const title = generateInitialTitle(effectivePrompt);
    createSessionRecord(dbSessionId, userId, piSessionId, title);
  } else {
    updateSessionTimestamp(dbSessionId);
  }
}

/**
 * Generate session name on first exchange.
 * @param {string} dbSessionId - The session ID
 * @param {string} effectivePrompt - The user prompt
 * @param {string} fullText - The full assistant response
 * @param {Function} writeEvent - SSE event writer
 */
export async function generateSessionNameIfNeeded(dbSessionId, effectivePrompt, fullText, writeEvent,req) {
  const messageCount = getSessionMessageCount(dbSessionId);
  console.log('trying to name session, recordCount: ',messageCount)
  if (messageCount === 1) {
    try {
      console.log('generate session name... ',effectivePrompt?.length, fullText.length)
      const name = await generateSessionName(effectivePrompt, fullText);
      console.log('got session name: ',name)
      updateSessionName(dbSessionId,req.user.userId, name);
      const sessionMeta = getSessionMeta(dbSessionId);
      console.log('got session meta: ',name)
      writeEvent("session_name", sessionMeta);
      console.log("session-name event done: ",sessionMeta.name)
    } catch (err) {
      console.error("Session naming failed:", err);
    }
  }
}