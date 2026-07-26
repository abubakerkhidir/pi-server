import { getChatHistory } from "@/frontend/api";
import type { ChatRecord, ChatState, TokenStats, SessionTokenStats, BackendRecord, BackendHistory, BackendSession } from "@/frontend/types";

/**
 * Convert a backend entity to the frontend AgentReplyEntity type.
 *
 * The frontend expects:
 *  MsgData   { type: "msg",   id: string,  content: string, sealed?: boolean }
 *  ThinkData { type: "think", id: string,  content: string, sealed?: boolean }
 *  ToolData  { type: "tool",  id: string,  name: string,  args, partialResult,
 *              result, isError, isComplete, sealed?: boolean }
 */
function mapEntity(e: BackendRecord["agentReply"]["entities"][0], index: number): ChatRecord["agentReply"]["entities"][0] {
  const base = { sealed: true };
  if (e.type === "think") {
    return {
      ...base,
      type: "think" as const,
      id: `think-${index}`,
      content: e.content || "",
      duration: e.duration,
      totalLength: e.totalLength,
    };
  }
  if (e.type === "msg") {
    return { ...base, type: "msg" as const, id: `msg-${index}`, content: e.content || "" };
  }
  if (e.type === "tool") {
    return {
      ...base,
      type: "tool" as const,
      id: `tool-${index}`,
      name: e.name || "",
      args: e.args,
      partialResult: undefined,
      result: e.result,
      isError: !!e.isError,
      isComplete: !!e.isComplete,
      duration: e.duration,
    };
  }
  if (e.type === "compact") {
    return {
      ...base,
      type: "compact" as const,
      id: `compact-${index}`,
      summary: e.summary,
      tokensBefore: e.tokensBefore,
      tokensAfter: e.tokensAfter,
      savedPct: e.savedPct,
      duration: e.duration,
      failed: e.failed,
    };
  }
  if (e.type === "turn") {
    return {
      ...base,
      type: "turn" as const,
      id: `turn-${index}`,
      turn: e.turn ?? 0,
      prompt_tokens: e.prompt_tokens ?? 0,
      output_tokens: e.output_tokens ?? 0,
      think_tokens: e.think_tokens ?? 0,
      cache_read: e.cache_read ?? 0,
      cache_write: e.cache_write ?? 0,
      ttft_ms: e.ttft_ms ?? null,
      duration_ms: e.duration_ms ?? null,
      prompt_per_sec: e.prompt_per_sec,
      output_per_sec: e.output_per_sec,
      prompt_ms: e.prompt_ms,
      predicted_ms: e.predicted_ms,
      predicted_per_second: e.predicted_per_second,
      predicted_per_token_ms: e.predicted_per_token_ms,
      draft_n: e.draft_n,
      draft_n_accepted: e.draft_n_accepted,
      stop_reason: e.stop_reason,
      tool_calls_count: e.tool_calls_count,
    };
  }
  // Fallback — treat as msg
  return { ...base, type: "msg" as const, id: `msg-${index}`, content: "" };
}

/**
 * Load session history from the backend.
 *
 * The backend now returns records in the same entity-based format used
 * by the frontend, including tokenStats per record and sessionStats.
 */
export async function loadSessionHistory(sessionId: string): Promise<{meta?:BackendSession,chat:ChatState}> {
  try {
    const raw = await getChatHistory(sessionId);
    const history = raw as BackendHistory;

    if (!history.records || !Array.isArray(history.records)) {
      console.warn("[loadSessionHistory] No records in response", history);
      return {chat:{ records: [] },meta:history.meta};
    }

    const records: ChatRecord[] = history.records.map((rec, ri) => {
      let entityIndex = 0;
      const entities = (rec.agentReply?.entities || []).map((e) => {
        const mapped = mapEntity(e, entityIndex);
        entityIndex++;
        return mapped;
      });

      return { id: rec.id || `rec-${ri}`, userMsg: { content: rec.userMsg?.content || "" },
        agentReply: { id: rec.agentReply?.id || "", entities, tokenStats: rec.agentReply?.tokenStats},
      };
    });

    return {chat:{records, sessionStats: history.sessionStats}, meta:history.meta};
  } catch (err) {
    console.error("[loadSessionHistory] Failed:", err);
    return {chat:{ records: [] },meta:{id:sessionId,user_id:''}};
  }
}
