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
 * Accumulate usage data from a usage event (one per message_end).
 * Called for each LLM response within an agentReply.
 */
export function fillUsageData(event, state) {
  const input = event.input || 0;
  const output = event.output || 0;
  const cacheRead = event.cacheRead || 0;
  const cacheWrite = event.cacheWrite || 0;
  const reasoning = event.reasoning || 0;
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
 * Calculate aggregate token stats for the entire agentReply.
 *
 * Primary: uses per-turn timing data from state.turns[] (populated by handleTurnEndEvent).
 * Fallback: if no turns available, falls back to accumulated usageData + wall-clock timing.
 *
 * @param {Object} usageData - Accumulated usage data across all turns
 * @param {number} responseStartTime - When the agentReply started
 * @param {Object} state - Handler state (contains turns[], firstTokenTime, etc.)
 * @param {Object} session - Pi session (for context usage)
 * @returns {Object} Token stats
 */
export function calculateTokenStats(usageData, responseStartTime, state, session) {
  // If provider didn't report reasoning tokens but thinking content exists, estimate from char count
  if (usageData && !usageData.think_tokens && state.thinkChars > 0) {
    usageData.think_tokens = Math.round(state.thinkChars / 4);
    state.sessionTotals.total_reasoning += usageData.think_tokens;
  }

  const prompt_tokens = usageData?.prompt_tokens ?? 0;
  const think_tokens = usageData?.think_tokens ?? 0;
  const output_tokens = usageData?.output_tokens ?? 0;

  let ttft_ms, totalDurationMs, prompt_token_s, output_token_s;

  if (state.turns && state.turns.length > 0) {
    const turns = state.turns;

    // Avg ttft across turns
    ttft_ms = Math.round(turns.reduce((sum, t) => sum + (t.ttft_ms || 0), 0) / turns.length);

    // Sum of all turn durations
    totalDurationMs = turns.reduce((sum, t) => sum + (t.duration_ms || 0), 0);

    // Weighted avg of output_per_sec (weighted by output tokens per turn)
    const turnsWithOutput = turns.filter(t => t.output_per_sec > 0 && t.output_tokens > 0);
    const totalOut = turnsWithOutput.reduce((sum, t) => sum + t.output_tokens, 0);
    output_token_s = totalOut > 0
      ? Math.round(turnsWithOutput.reduce((sum, t) => sum + t.output_per_sec * t.output_tokens, 0) / totalOut)
      : 0;

    // Simple avg of prompt_per_sec
    const turnPromptRates = turns.filter(t => t.prompt_per_sec > 0).map(t => t.prompt_per_sec);
    prompt_token_s = turnPromptRates.length > 0
      ? Math.round(turnPromptRates.reduce((a, b) => a + b, 0) / turnPromptRates.length)
      : 0;
  } else {
    // No turns — no speed data available
    totalDurationMs = Date.now() - responseStartTime;
    ttft_ms = state.firstTokenTime ? state.firstTokenTime - responseStartTime : totalDurationMs;
    output_token_s = 0;
    prompt_token_s = 0;
  }

  // Build session totals for lifetime tracking across compactions
  let sdkTokens = {};
  if (session) {
    try {
      const sdkStats = session.getSessionStats();
      sdkTokens = sdkStats?.tokens || {};
      state.sessionTotals.context_used = sdkStats?.contextUsage?.tokens || sdkTokens?.total || state.contextUsage?.contextSize || 0;
      state.sessionTotals.context_size = sdkStats?.contextUsage?.contextWindow || state.contextUsage?.contextWindow || 128000;
      state.sessionTotals.context_percent = sdkStats?.contextUsage?.percent || state.contextUsage?.contextPercent || 0;
      state.sessionTotals.currentCost = sdkStats?.cost || 0;
    } catch {}
  }

  return {
    prompt_tokens,
    think_tokens,
    output_tokens,
    ttft_ms,
    totalDurationMs,
    prompt_token_s,
    output_token_s,
    sessionTotals: state.sessionTotals,
    turns: state.turns, // include per-turn data for reference
  };
}

/**
 * Save token stats to database.
 */
export function saveTokenStats(recordId, t) {
  updateTokenStats(t.prompt_tokens, t.think_tokens, t.output_tokens, t.prompt_token_s, t.output_token_s, t.totalDurationMs, t.ttft_ms, recordId);
}

/**
 * Update session context usage from pi SDK.
 */
export function updateSessionContextUsage(dbSessionId, contextUsage) {
  if (contextUsage?.contextSize != null) {
    updateCtxSizeAndPrecentage(contextUsage.contextSize, contextUsage.contextPercent, dbSessionId);
  }
  if (contextUsage?.contextWindow != null) {
    updateCtxWindow(contextUsage.contextWindow, dbSessionId);
  }
}
