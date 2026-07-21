import { Dispatch, SetStateAction } from "react";
import type { ChatState, TokenStats } from "../../../types";


export function getOnTokenStatsHndlr(setChatState: Dispatch<SetStateAction<ChatState>>): (stats: TokenStats) => void {
  return (stats: TokenStats) => {
    console.log('got token stats: ',stats)
    setChatState((prev) => {
      const last = prev.records[prev.records.length - 1];
      if (!last) return prev;
      last.agentReply.tokenStats = stats;
      const newState = { records: [...prev.records], sessionStats: stats.sessionTotals };
      console.log('update token stats in chat: ',stats.sessionTotals, newState)
      return newState;
    });
  };
}

/** Heuristic: estimate tokens from text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}