/**
 * Token statistics calculation for chat records.
 *
 * Token counts are now provided by the pi SDK via usage events.
 * This module only provides session-level aggregation.
 */

/**
 * Extract token stats from a record (handles both formats).
 */
function extractRecordTokenStats(rec) {
  if (rec.tokenStats) {
    return {
      prompt: rec.tokenStats.prompt_tokens || 0,
      think: rec.tokenStats.think_tokens || 0,
      output: rec.tokenStats.output_tokens || 0,
    };
  }
  return {
    prompt: rec.prompt_tokens || 0,
    think: rec.think_tokens || 0,
    output: rec.output_tokens || 0,
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
    const stats = extractRecordTokenStats(rec);
    totalPrompt += stats.prompt;
    totalThink += stats.think;
    totalOutput += stats.output;
  }

  const totalUsed = totalPrompt + totalThink + totalOutput;
  const contextSizeNum = contextSize || 128000;
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
