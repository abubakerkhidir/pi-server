import { updateTokenStats } from "../db/chat-record-dao.js";
import { updateCtxSizeAndPrecentage, updateCtxWindow } from "../db/session-dao.js";

/**
 * Calculate TTFT (time to first token) in seconds.
 */
function calculateTtftSeconds(firstTokenTime, responseStartTime) {
  const ttftMs = firstTokenTime ? firstTokenTime - responseStartTime : 0;
  return ttftMs / 1000;
}

/**
 * Calculate generation time in seconds (total duration minus TTFT).
 */
function calculateGenerationSeconds(totalDurationMs, ttftMs) {
  const generationMs = totalDurationMs - ttftMs;
  return generationMs / 1000;
}

/**
 * Calculate tokens per second for prompt (during TTFT).
 */
function calculatePromptTokensPerSecond(promptTokens, ttftSec) {
  return ttftSec > 0 ? Math.round(promptTokens / ttftSec) : 0;
}

/**
 * Calculate tokens per second for output (during generation).
 */
function calculateOutputTokensPerSecond(outputTokens, generationSec) {
  return generationSec > 0 ? Math.round(outputTokens / generationSec) : 0;
}

/**
 * Calculate token stats from usage data and timing.
 * @param {Object} usageData - Accumulated usage data
 * @param {number} responseStartTime - Response start timestamp
 * @param {number} firstTokenTime - First token timestamp
 * @returns {Object} Token stats
 */
export function calculateTokenStats(usageData, responseStartTime, firstTokenTime) {
  const totalDurationMs = Date.now() - responseStartTime;
  const ttftMs = firstTokenTime ? firstTokenTime - responseStartTime : totalDurationMs;

  const promptTokens = usageData?.prompt_tokens ?? 0;
  const thinkTokens = usageData?.think_tokens ?? 0;
  const outputTokens = usageData?.output_tokens ?? 0;

  const ttftSec = ttftMs / 1000;
  const generationSec = calculateGenerationSeconds(totalDurationMs, ttftMs);

  return {
    prompt_tokens: promptTokens,
    think_tokens: thinkTokens,
    output_tokens: outputTokens,
    prompt_token_s: calculatePromptTokensPerSecond(promptTokens, ttftSec),
    output_token_s: calculateOutputTokensPerSecond(outputTokens, generationSec),
    ttft_ms: ttftMs,
    totalDurationMs,
  };
}

/**
 * Save token stats to database.
 * @param {string} recordId - The chat record ID
 * @param {Object} t - Token stats object
 */
export function saveTokenStats(recordId, t) {
  updateTokenStats(t.prompt_tokens, t.think_tokens, t.output_tokens, t.prompt_token_s, t.output_token_s, t.totalDurationMs, t.ttft_ms, recordId);
}

/**
 * Update session context usage from pi SDK.
 * @param {string} dbSessionId - The session ID
 * @param {Object} contextUsage - Context usage from pi SDK
 */
export function updateSessionContextUsage(dbSessionId, contextUsage) {
  if (contextUsage?.contextSize != null) {
    updateCtxSizeAndPrecentage(contextUsage.contextSize, contextUsage.contextPercent, dbSessionId);
  }
  if (contextUsage?.contextWindow != null) {
    updateCtxWindow(contextUsage.contextWindow, dbSessionId);
  }
}


