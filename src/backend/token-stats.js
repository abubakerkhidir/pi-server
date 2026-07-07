/**
 * Token statistics calculation for chat records.
 *
 * Token estimation uses a simple ratio of ~4 characters per token,
 * which is a reasonable approximation for English text.
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text content.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Compute token stats for a single record.
 * @param {string} userMsgContent - The user message content
 * @param {Array} entities - Array of entity objects (must have type, content, and optionally durationMs)
 * @param {number} totalDurationMs - Total wall-clock time for the response generation
 * @returns {Object} { prompt_tokens, think_tokens, output_tokens, prompt_token_s, output_token_s }
 */
export function computeRecordTokenStats(userMsgContent, entities, totalDurationMs) {
  const promptTokens = estimateTokens(userMsgContent);

  let thinkTokens = 0;
  let outputTokens = 0;
  let thinkDurationMs = 0;
  let outputDurationMs = 0;

  for (const entity of entities) {
    if (entity.type === 'think') {
      const tokens = estimateTokens(entity.content);
      thinkTokens += tokens;
      if (entity.durationMs) {
        thinkDurationMs += entity.durationMs;
      }
    } else if (entity.type === 'msg') {
      outputTokens += estimateTokens(entity.content);
      if (entity.durationMs) {
        outputDurationMs += entity.durationMs;
      }
    }
    // Tool entities are not counted separately — they contribute to output
  }

  // Fallback: if no individual durations, split proportionally by token count
  if (!thinkDurationMs && !outputDurationMs && totalDurationMs) {
    const totalEntityTokens = thinkTokens + outputTokens;
    if (totalEntityTokens > 0) {
      thinkDurationMs = Math.round(totalDurationMs * (thinkTokens / totalEntityTokens));
      outputDurationMs = Math.round(totalDurationMs * (outputTokens / totalEntityTokens));
    } else {
      outputDurationMs = totalDurationMs;
    }
  }

  const thinkDurationSec = thinkDurationMs / 1000;
  const outputDurationSec = outputDurationMs / 1000;

  const promptTokenS = thinkDurationSec > 0
    ? Math.round(promptTokens / thinkDurationSec)
    : 0;

  const outputTokenS = outputDurationSec > 0
    ? Math.round(outputTokens / outputDurationSec)
    : 0;

  return {
    prompt_tokens: promptTokens,
    think_tokens: thinkTokens,
    output_tokens: outputTokens,
    prompt_token_s: promptTokenS,
    output_token_s: outputTokenS,
  };
}

/**
 * Accumulate token stats across all records in a session.
 * @param {Array} records - Array of records each with a tokenStats field
 * @param {number} contextSize - The model's context window size in tokens
 * @returns {Object} { total_prompt, total_think, total_output, context_used_pct, context_size }
 */
export function computeSessionTokenStats(records, contextSize) {
  let totalPrompt = 0;
  let totalThink = 0;
  let totalOutput = 0;

  for (const rec of records) {
    const ts = rec.tokenStats;
    if (ts) {
      totalPrompt += ts.prompt_tokens || 0;
      totalThink += ts.think_tokens || 0;
      totalOutput += ts.output_tokens || 0;
    } else if (rec.prompt_tokens != null) {
      // Direct columns from DB query
      totalPrompt += rec.prompt_tokens || 0;
      totalThink += rec.think_tokens || 0;
      totalOutput += rec.output_tokens || 0;
    }
  }

  const totalUsed = totalPrompt + totalThink + totalOutput;
  const contextSizeNum = contextSize || 128000; // default 128K
  const contextUsedPct = contextSizeNum > 0
    ? Math.round((totalUsed / contextSizeNum) * 100)
    : 0;

  return {
    total_prompt: totalPrompt,
    total_think: totalThink,
    total_output: totalOutput,
    context_used_pct: contextUsedPct,
    context_size: contextSizeNum,
  };
}
