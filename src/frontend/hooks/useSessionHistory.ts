import { getChatHistory } from "@/frontend/api";
import type { ChatRecord, ChatState, TokenStats, SessionTokenStats, BackendRecord, BackendHistory, BackendSession } from "@/frontend/types";

/** Default page size for paginated session loading */
export const RECORDS_PAGE_SIZE = 3;

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
 * Load session history from the backend (paginated).
 *
 * @param sessionId - Session to load
 * @param limit - Max records to fetch (default RECORDS_PAGE_SIZE)
 * @param offset - Number of newest records to skip (for loading older records)
 */
export async function loadSessionHistory(
  sessionId: string,
  limit: number = RECORDS_PAGE_SIZE,
  offset: number = 0,
): Promise<{ meta?: BackendSession; chat: ChatState; total: number; hasMore: boolean }> {
  try {
    const raw = await getChatHistory(sessionId, limit, offset);
    const history = raw as BackendHistory & { total: number; hasMore: boolean };

    if (!history.records || !Array.isArray(history.records)) {
      console.warn("[loadSessionHistory] No records in response", history);
      return { chat: { records: [] }, meta: history.meta, total: 0, hasMore: false };
    }

    const records: ChatRecord[] = history.records.map((rec, ri) => {
      let entityIndex = 0;
      const entities = (rec.agentReply?.entities || []).map((e) => {
        const mapped = mapEntity(e, entityIndex);
        entityIndex++;
        return mapped;
      });

      return {
        id: rec.id || `rec-${ri}`,
        userMsg: { content: rec.userMsg?.content || "" },
        agentReply: { id: rec.agentReply?.id || "", entities, tokenStats: rec.agentReply?.tokenStats },
        created_at: rec.created_at,
      };
    });

    return {
      chat: { records, sessionStats: history.sessionStats },
      meta: history.meta,
      total: history.total ?? records.length,
      hasMore: history.hasMore ?? false,
    };
  } catch (err) {
    console.error("[loadSessionHistory] Failed:", err);
    return { chat: { records: [] }, meta: { id: sessionId, user_id: "" }, total: 0, hasMore: false };
  }
}
