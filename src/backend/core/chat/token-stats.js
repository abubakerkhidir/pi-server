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

//this is called whenever usage_data event is sent by pi-session-manager during message-end (one agentReply can have multiple msg-end event so we accumlate total on the state for the agentReply and for entire session)
export function fillUsageData(event, state) {
  const input = event.input || 0;
  const output = event.output || 0;
  const cacheRead = event.cacheRead || 0
  const cacheWrite = event.cacheWrite || 0
  const reasoning = event.reasoning || 0
  if (!state.usageData) {
    state.usageData = {
      prompt_tokens: input,
      output_tokens: output,
      think_tokens: reasoning,
      cache_read: cacheRead,
      cache_write: cacheWrite,
    };
  } else {
    state.usageData.prompt_tokens += input;
    state.usageData.output_tokens += output;
    state.usageData.think_tokens += reasoning;
    state.usageData.cache_read += cacheRead;
    state.usageData.cache_write += cacheWrite;
  }
  state.cumulativeInput += input;
  state.cumulativeOutput += output;
  state.cumulativeCacheRead += cacheRead;
  state.cumulativeCacheWrite += cacheWrite;
  state.cumulativeReasoning += reasoning;
}   

/**
 * Calculate token stats from usage data and timing.
 * @param {Object} usageData - Accumulated usage data
 * @param {number} responseStartTime - Response start timestamp
 * @param {number} firstTokenTime - First token timestamp
 * @returns {Object} Token stats
 */
export function calculateTokenStats(usageData, responseStartTime, state, session) {
  // If provider didn't report reasoning tokens but thinking content exists, estimate from char count
  if (usageData && !usageData.think_tokens && state.thinkChars > 0) {
    usageData.think_tokens = Math.round(state.thinkChars / 4);
  }
  const totalDurationMs = Date.now() - responseStartTime;
  const ttftMs = state.firstTokenTime ? state.firstTokenTime - responseStartTime : totalDurationMs;

  const promptTokens = usageData?.prompt_tokens ?? 0;
  const thinkTokens = usageData?.think_tokens ?? 0;
  const outputTokens = usageData?.output_tokens ?? 0;

  const ttftSec = ttftMs / 1000;
  const generationSec = calculateGenerationSeconds(totalDurationMs, ttftMs);

  // Build session totals for lifetime tracking across compactions. After compaction, getSessionStats() only returns current-turn usage because
  // previous messages were removed. We use cumulativeInput/Output (tracked in handleUsageEvent) to reconstruct the full lifetime total.
  let sessionTotals = {};
  if (session) {
    try {
      const sdkStats = session.getSessionStats();
      const sdkTokens = sdkStats?.tokens || {};
      const outputTotal = state.compactOccurred? (sdkTokens.output || 0) + state.cumulativeOutput: state.cumulativeOutput;
      const inputTotal = state.compactOccurred? (sdkTokens.input || 0) + state.cumulativeInput: state.cumulativeInput;
      const cacheReadTotal = state.compactOccurred? (sdkTokens.cacheRead || 0) + state.cumulativeCacheRead: state.cumulativeCacheRead;
      const cacheWriteTotal = state.compactOccurred? (sdkTokens.cacheWrite || 0) + state.cumulativeCacheWrite: state.cumulativeCacheWrite;
      const reasoningTotal = state.compactOccurred? (sdkTokens.reasoning || 0) + state.cumulativeReasoning: state.cumulativeReasoning;
      const ctxSize = sdkStats?.contextUsage?.tokens || sdkTokens?.total || state.contextUsage.contextSize || 0
      const ctxWin = sdkStats?.contextUsage?.contextWindow || state.contextUsage.contextWindow || 128000
      const ctxPercent = sdkStats?.contextUsage?.percent || state.contextUsage.contextPercent || 0
      sessionTotals = {ctxSize,ctxWin,ctxPercent,total_input: inputTotal,total_output: outputTotal,total_cache_read:cacheReadTotal,total_cache_write:cacheWriteTotal,total_reasoning:reasoningTotal, total_cost: sdkStats?.cost || 0};
    } catch {}
  }     
  const tokenUsage= {
    prompt_tokens: promptTokens,
    think_tokens: thinkTokens,
    output_tokens: outputTokens,
    prompt_token_s: calculatePromptTokensPerSecond(promptTokens, ttftSec),
    output_token_s: calculateOutputTokensPerSecond(outputTokens, generationSec),
    ttft_ms: ttftMs,
    totalDurationMs,
    sessionTotals
  };

  return tokenUsage
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


