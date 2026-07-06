import { useRef, useCallback } from "react";
import { createChatStream } from "@/frontend/api";
import type { AgentReplyEntity, MsgData, ToolData, ThinkData } from "@/frontend/types";

let thinkCounter = 0;
let msgCounter = 0;
const nextThinkId = () => `think-${++thinkCounter}`;
const nextMsgId = () => `msg-${++msgCounter}`;

/* ── Public API ──────────────────────────────────────── */

interface UseChatStreamOptions {
  currentSessionId: string | null;
  userSettings: { tool_lines: number; thinking_lines: number };
}

export type OnEntityUpdate = (entities: AgentReplyEntity[]) => void;
export type OnStreamEnd = () => void;

export interface UseChatStreamResult {
  sessionId: string | null;
  /**
   * Start streaming for a new user message.
   *
   * The parent MUST:
   *   1. Create a ChatRecord with empty agentReply.entities BEFORE calling
   *   2. Pass `onEntityUpdate` — called after every SSE event (streaming UI updates)
   *   3. Pass `onStreamEnd` — called when the stream ends (done/error/abort)
   *
   * handleSend returns immediately (fire-and-forget). The parent sets
   * `isProcessing = true` before calling and `isProcessing = false` in
   * `onStreamEnd`.
   */
  handleSend: (
    prompt: string,
    files: File[],
    onEntityUpdate: OnEntityUpdate,
    onStreamEnd: OnStreamEnd,
  ) => void;
  resetState: () => void;
}

/**
 * Simplified streaming hook.
 *
 * All entity aggregation lives inside this hook.  After every SSE event the
 * hook calls `onEntityUpdate(currentEntities)` so the parent can update its
 * ChatRecord immediately — enabling real-time streaming in the UI.
 *
 * When the stream ends (done/error/abort) the hook calls `onStreamEnd`.
 *
 * Error handling:
 *   - Network / server errors → onError seals all entities
 *   - Abort (new message while streaming) → silently ignored, entities kept
 */
export function useChatStream({
  currentSessionId,
}: UseChatStreamOptions): UseChatStreamResult {
  const sessionIdRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  const entitiesRef = useRef<AgentReplyEntity[]>([]);

  /* ── helpers ─────────────────────────────────────────── */
  const getLastEntity = <T extends AgentReplyEntity>(
    typ: string,
    list: AgentReplyEntity[],
  ): T | undefined =>
    [...list].reverse().find((e) => e.type === typ) as T | undefined;

  const sealLastEntity = (typ: string, list: AgentReplyEntity[]) => {
    const ent = getLastEntity<AgentReplyEntity>(typ, list);
    if (ent) ent.sealed = true;
  };

  /* ── handleSend ──────────────────────────────────────── */
  const handleSend = useCallback(
    (
      prompt: string,
      files: File[],
      onEntityUpdate: OnEntityUpdate,
      onStreamEnd: OnStreamEnd,
    ) => {
      if (!prompt || isProcessingRef.current) return;
      isProcessingRef.current = true;

      // Fresh entity buffer for this stream
      entitiesRef.current = [
        { type: "msg", id: nextMsgId(), content: "", sealed: false },
      ];

      let streamEnded = false;
      const markEnded = () => {
        if (streamEnded) return;
        streamEnded = true;
        isProcessingRef.current = false;
        onStreamEnd();
      };

      try {
        createChatStream(
          currentSessionId,
          prompt,
          files?.length ? files : undefined,
          (event: string, data: Record<string, unknown>) => {
            switch (event) {
              case "session":
                sessionIdRef.current = data.sessionId as string;
                break;

              case "thinking": {
                sealLastEntity("msg", entitiesRef.current);
                const content = String(data.content || "");
                const lastThink = getLastEntity<ThinkData>("think", entitiesRef.current);
                if (lastThink && !lastThink.sealed) {
                  lastThink.content += content;
                } else {
                  entitiesRef.current.push({ type: "think", id: nextThinkId(), content });
                }
                break;
              }

              case "text": {
                sealLastEntity("think", entitiesRef.current);
                const content = String(data.content || "");
                const lastMsg = getLastEntity<MsgData>("msg", entitiesRef.current);
                if (lastMsg && !lastMsg.sealed) {
                  lastMsg.content += content;
                } else {
                  entitiesRef.current.push({ type: "msg", id: nextMsgId(), content, sealed: false });
                }
                break;
              }

              case "tool_start": {
                sealLastEntity("think", entitiesRef.current);
                sealLastEntity("msg", entitiesRef.current);
                entitiesRef.current.push({
                  type: "tool",
                  id: data.id as string,
                  name: data.name as string,
                  args: data.args as Record<string, unknown> | undefined,
                  partialResult: undefined,
                  result: undefined,
                  isError: false,
                  isComplete: false,
                });
                break;
              }

              case "tool_update": {
                const toolId = data.id as string;
                const idx = entitiesRef.current.findIndex(
                  (e) =>
                    e.type === "tool" &&
                    (e as ToolData).id === toolId &&
                    !(e as ToolData).isComplete,
                );
                if (idx >= 0) (entitiesRef.current[idx] as ToolData).partialResult = data.partialResult;
                break;
              }

              case "tool_end": {
                const toolId = data.id as string;
                const idx = entitiesRef.current.findIndex(
                  (e) =>
                    e.type === "tool" &&
                    (e as ToolData).id === toolId &&
                    !(e as ToolData).isComplete,
                );
                if (idx >= 0) {
                  (entitiesRef.current[idx] as ToolData).result = data.result;
                  (entitiesRef.current[idx] as ToolData).isError = !!data.isError;
                  (entitiesRef.current[idx] as ToolData).isComplete = true;
                }
                break;
              }

              case "done":
              case "error": {
                for (const ent of entitiesRef.current) ent.sealed = true;
                markEnded();
                break;
              }
            }

            // Notify parent after every event — enables streaming UI updates
            onEntityUpdate(entitiesRef.current);
          },
          (err: Error) => {
            // AbortError is expected when user sends a new message — ignore
            if (err.name !== "AbortError") {
              for (const ent of entitiesRef.current) ent.sealed = true;
            }
            markEnded();
          },
        );
      } catch {
        markEnded();
      }
    },
    [currentSessionId],
  );

  const resetState = useCallback(() => {
    sessionIdRef.current = null;
    isProcessingRef.current = false;
  }, []);

  return { sessionId: sessionIdRef.current, handleSend, resetState };
}
