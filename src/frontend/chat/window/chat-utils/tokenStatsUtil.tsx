import { Dispatch, SetStateAction } from "react";
import type { ChatRecord, ChatState, SessionTokenStats, TokenStats } from "../../../types";


/**
 * Compute session-level token stats from all records. // Session-level token stats derived from records
 */
export function computeSessionStats(records: ChatRecord[]): SessionTokenStats | undefined {
  if (records.length === 0) return undefined;

  let total_prompt = 0;
  let total_think = 0;
  let total_text = 0;
  let ttftSum = 0;
  let ttftCount = 0;

  for (const rec of records) {
    const ts = rec.agentReply.tokenStats;
    if (ts) {
      total_prompt += ts.prompt_tokens;
      total_think += ts.think_tokens;
      total_text += ts.output_tokens;
      if (ts.ttft_ms) {
        ttftSum += ts.ttft_ms;
        ttftCount++;
      }
    } else {
      // Fallback estimate if no token stats yet (streaming in progress)
      total_prompt += estimateTokens(rec.userMsg.content);
      for (const ent of rec.agentReply.entities) {
        if (ent.type === "think") total_think += estimateTokens(ent.content);
        if (ent.type === "msg") total_text += estimateTokens(ent.content);
      }
    }
  }

  // total-output is the sum of think + text (msg)
  const totalUsed = total_prompt + total_think + total_text;
  const contextSize = 128000; // default; can be refined from model info
  const context_used_pct = Math.round((totalUsed / contextSize) * 100);

  return {
    total_prompt,
    total_think,
    total_output: total_think + total_text,
    total_text,
    context_used_pct: Math.min(context_used_pct, 100),
    context_size: contextSize,
    ttft_avg_ms: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : 0,
  };
}
export function getOnTokenStatsHndlr(setChatState: Dispatch<SetStateAction<ChatState>>): (stats: TokenStats) => void {
  return (stats: TokenStats) => {
    setChatState((prev) => {
      const last = prev.records[prev.records.length - 1];
      if (!last) return prev;
      last.agentReply.tokenStats = stats;
      return { records: [...prev.records] };
    });
  };
}

/** Heuristic: estimate tokens from text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}