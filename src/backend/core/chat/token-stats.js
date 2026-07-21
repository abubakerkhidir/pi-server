import { updateTokenStats } from "../db/chat-record-dao.js";
import { updateCtxSizeAndPrecentage, updateCtxWindow } from "../db/session-dao.js";

/**
 * Calculate TTFT (time to first token) in seconds.
 */
function calculateTtftSeconds(firstTokenTime, responseStartTime) {
  const ttftMs = firstTokenTime ? firstTokenTime - responseStartTime : 0;
  return ttftMs / 1000;
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
  state.sessionTotals.total_input += input;
  state.sessionTotals.total_output += output;
  state.sessionTotals.total_cache_read += cacheRead;
  state.sessionTotals.total_cache_write += cacheWrite;
  state.sessionTotals.total_reasoning += reasoning;
}   

/**
 * Calculate token stats from usage data and timing. this called at agentReply end
 * @param {Object} usageData - Accumulated usage data
 * @param {number} responseStartTime - Response start timestamp
 * @param {number} firstTokenTime - First token timestamp
 * @returns {Object} Token stats
 */
export function calculateTokenStats(usageData, responseStartTime, state, session) {
  // If provider didn't report reasoning tokens but thinking content exists, estimate from char count
  if (usageData && !usageData.think_tokens && state.thinkChars > 0) {
    usageData.think_tokens = Math.round(state.thinkChars / 4);
    state.sessionTotals.total_reasoning += usageData.think_tokens;
  }
  const totalDurationMs = Date.now() - responseStartTime;
  const ttftMs = state.firstTokenTime ? state.firstTokenTime - responseStartTime : totalDurationMs;

  const prompt_tokens = usageData?.prompt_tokens ?? 0;
  const think_tokens = usageData?.think_tokens ?? 0;
  const output_tokens = usageData?.output_tokens ?? 0;

  const ttftSec = ttftMs / 1000;
  const generationSec = (totalDurationMs - ttftMs) / 1000;
  const output_token_s = generationSec > 0 ? Math.round(output_tokens / generationSec) : 0;
  const prompt_token_s = ttftSec > 0 ? Math.round(prompt_tokens / ttftSec) : 0

  // Build session totals for lifetime tracking across compactions. After compaction, getSessionStats() only returns current-turn usage because
  // previous messages were removed. We use total_input/Output (tracked in handleUsageEvent) to reconstruct the full lifetime total.
  let sdkTokens = {};
  if (session) {
    try {
      const sdkStats = session.getSessionStats();
      sdkTokens = sdkStats?.tokens || {};
      state.sessionTotals.context_used = sdkStats?.contextUsage?.tokens || sdkTokens?.total || state.contextUsage.contextSize || 0
      state.sessionTotals.context_size = sdkStats?.contextUsage?.contextWindow || state.contextUsage.contextWindow || 128000
      state.sessionTotals.context_percent = sdkStats?.contextUsage?.percent || state.contextUsage.contextPercent || 0
      state.sessionTotals.currentCost = sdkStats?.cost || 0
    } catch {}
  }     
  const tokenUsage= { prompt_tokens, think_tokens, output_tokens,ttft_ms: ttftMs, totalDurationMs,prompt_token_s, output_token_s,sessionTotals:state.sessionTotals};
  //console.log('token-stats: ',tokenUsage, ' \nsdk-tokens: ',sdkTokens, ' \nbefore-compact: ',state.beforeCompact)
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


