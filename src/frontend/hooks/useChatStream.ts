import { useRef, useCallback } from "react";
import { createChatStream, type AbortChatStream } from "@/frontend/api";
import type { AgentReplyEntity, MsgData, ToolData, ThinkData, TokenStats } from "@/frontend/types";

let thinkCounter = 0;
let msgCounter = 0;
const nextThinkId = () => `think-${++thinkCounter}`;
const nextMsgId = () => `msg-${++msgCounter}`;

interface UseChatStreamOptions {
  currentSessionId: string | null;
  userSettings: { tool_lines: number; thinking_lines: number };
}

export type OnEntityUpdate = (entities: AgentReplyEntity[]) => void;
export type OnStreamEnd = () => void;
export type OnSessionName = (session: { id: string; name: string; updated_at: string; created_at?: string }) => void;
export type OnSessionCreated = (sessionId: string) => void;
export type OnTokenStats = (stats: TokenStats) => void;

export interface UseChatStreamResult {
  sessionId: string | null;
  handleSend: (
    prompt: string,
    files: File[] | undefined,
    onEntityUpdate: OnEntityUpdate,
    onStreamEnd: OnStreamEnd,
    onSessionName?: OnSessionName,
    onSessionCreated?: OnSessionCreated,
    onTokenStats?: OnTokenStats,
  ) => void;
  stopStream: () => void;
  resetState: () => void;
}

export function useChatStream({
  currentSessionId,
}: UseChatStreamOptions): UseChatStreamResult {
  const sessionIdRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  const entitiesRef = useRef<AgentReplyEntity[]>([]);
  // Track entity start times for live duration calculation
  const entityStartTimes = useRef<Map<string, number>>(new Map());
  const abortRef = useRef<AbortChatStream | null>(null);

  const getLastEntity = <T extends AgentReplyEntity>(
    typ: string,
    list: AgentReplyEntity[],
  ): T | undefined =>
    [...list].reverse().find((e) => e.type === typ) as T | undefined;

  const sealLastEntity = (typ: string, list: AgentReplyEntity[]) => {
    const ent = getLastEntity<AgentReplyEntity>(typ, list);
    if (ent) {
      ent.sealed = true;
      // Calculate duration from start time
      const startedAt = entityStartTimes.current.get(ent.id);
      if (startedAt) {
        (ent as any).duration = Math.round((Date.now() - startedAt) / 1000);
        entityStartTimes.current.delete(ent.id);
      }
      if (ent.type === "think") {
        (ent as ThinkData).totalLength = (ent as ThinkData).content.length;
      }
    }
  };

  const handleSend = useCallback(
    (
      prompt: string,
      files: File[] | undefined,
      onEntityUpdate: OnEntityUpdate,
      onStreamEnd: OnStreamEnd,
      onSessionName?: OnSessionName,
      onSessionCreated?: OnSessionCreated,
      onTokenStats?: OnTokenStats,
    ) => {

      if (!prompt && (!files || files.length === 0) || isProcessingRef.current) {
        console.log('ignore send button: ',prompt, files?.length, isProcessingRef.current)
        return;
      }
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
        abortRef.current = null;
        onStreamEnd();
      };

      try {
        const abort = createChatStream(
          currentSessionId,
          prompt,
          files?.length ? files : undefined,
          (event: string, data: Record<string, unknown>) => {
            switch (event) {
              case "session":
                sessionIdRef.current = data.sessionId as string;
                onSessionCreated?.(data.sessionId as string);
                break;

              case "thinking": {
                sealLastEntity("msg", entitiesRef.current);
                const content = String(data.content || "");
                const lastThink = getLastEntity<ThinkData>("think", entitiesRef.current);
                if (lastThink && !lastThink.sealed) {
                  lastThink.content += content;
                } else {
                  const id = nextThinkId();
                  entityStartTimes.current.set(id, Date.now());
                  entitiesRef.current.push({ type: "think", id, content });
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
                const toolId = data.id as string;
                entityStartTimes.current.set(toolId, Date.now());
                entitiesRef.current.push({
                  type: "tool",
                  id: toolId,
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
                  const startedAt = entityStartTimes.current.get(toolId);
                  if (startedAt) {
                    (entitiesRef.current[idx] as any).duration = Math.round((Date.now() - startedAt) / 1000);
                    entityStartTimes.current.delete(toolId);
                  }
                }
                break;
              }

              case "session_name": {
                onSessionName?.(data as { id: string; name: string; updated_at: string; created_at?: string });
                break;
              }

              case "record_stats": {
                // Per-record token stats sent by backend
                onTokenStats?.(data as unknown as TokenStats);
                break;
              }

              case "done":
              case "error": {
                for (const ent of entitiesRef.current) ent.sealed = true;
                markEnded();
                break;
              }
            }

            onEntityUpdate(entitiesRef.current);
          },
          (err: Error) => {
            if (err.name !== "AbortError") {
              for (const ent of entitiesRef.current) ent.sealed = true;
            }
            markEnded();
          },
        );
        abortRef.current = abort;
      } catch {
        markEnded();
      }
    },
    [currentSessionId],
  );

  const resetState = useCallback(() => {
    sessionIdRef.current = null;
    isProcessingRef.current = false;
    abortRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    abortRef.current?.();
  }, []);

  return { sessionId: sessionIdRef.current, handleSend, stopStream, resetState };
}
