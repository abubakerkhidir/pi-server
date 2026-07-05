import { useState, useRef, useCallback } from "react";
import { createChatStream, type AbortChatStream } from "@/frontend/api";
import type { AgentReplyEntity, MsgData, ToolData, ThinkData } from "@/frontend/types";

let thinkCounter = 0;
let msgCounter = 0;
const nextThinkId = () => `think-${++thinkCounter}`;
const nextMsgId = () => `msg-${++msgCounter}`;

interface StreamResult {
  entities: AgentReplyEntity[];
  endFlag: boolean;
  sessionId: string | null;
}

interface UseChatStreamOptions {
  currentSessionId: string | null;
  isProcessing: boolean;
  userSettings: { tool_lines: number; thinking_lines: number };
}

export function useChatStream({ currentSessionId, isProcessing, userSettings }: UseChatStreamOptions) {
  const [entities, setEntities] = useState<AgentReplyEntity[]>([]);
  const [endFlag, setEndFlag] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const currentSessionIdRef = useRef(currentSessionId);
  const isProcessingRef = useRef(isProcessing);
  currentSessionIdRef.current = currentSessionId;
  isProcessingRef.current = isProcessing;

  const resetState = useCallback(() => {
    setEntities([]);
    setEndFlag(false);
    setSessionId(null);
  }, []);

  const getLastEntity = (typ:string,next:AgentReplyEntity[])=>{
      return  [...next].reverse().find((e) => e.type === typ);
  }
  const sealLastEntity = (typ:string,next:AgentReplyEntity[])=>{
	const msgEntity = getLastEntity(typ,next);
	if(msgEntity) msgEntity.sealed = true;
  }

  const handleSend = useCallback(
    async (prompt: string, files: File[]): Promise<AbortChatStream> => {
      if (!prompt || isProcessingRef.current) {
        return () => {};
      }
      resetState();

      // Create the MsgData for the assistant text response (empty initially)
      const msgId = nextMsgId();
      setEntities([{ type: "msg", id: msgId, content: "", sealed: false }]);

      let abortStream: AbortChatStream | null = null;
      const textBuffer: string[] = [];

      abortStream = createChatStream(
        currentSessionIdRef.current,
        prompt,
        files.length > 0 ? files : undefined,
        (event: string, data: Record<string, unknown>) => {
          setEntities((prev) => {
            const next = [...prev];
            switch (event) {
              case "session": {
                setSessionId(data.sessionId as string);
                break;
              }
              case "thinking": {
		sealLastEntity("msg",next)
                const content = String(data.content || "");
                const lastThink = getLastEntity("think",next);
                if (lastThink && !(lastThink as ThinkData).sealed) {
                  (lastThink as ThinkData).content += content;
                } else {
                  // New thinking block
                  next.push({ type: "think", id: nextThinkId(), content });
                }
                break;
              }
              case "text": {
                sealLastEntity("think",next);
                const content = String(data.content || "");
		const lastMsg = getLastEntity("msg",next);
		if (lastMsg && !(lastMsg as MsgData).sealed) {
                  (lastMsg as MsgData).content += content;
                } else {
                  next.push({ type: "msg", id: nextMsgId(), content });
                }
                break;
              }
              case "tool_start": {
		sealLastEntity("think",next);
                sealLastEntity("msg",next);
                const toolData: ToolData = {
                  type: "tool",
                  id: data.id as string,
                  name: data.name as string,
                  args: data.args as Record<string, unknown> | undefined,
                  partialResult: undefined,
                  result: undefined,
                  isError: false,
                  isComplete: false,
                };
                next.push(toolData);
                break;
              }
              case "tool_update": {
                const toolId = data.id as string;
                const idx = next.findIndex((e) => e.type === "tool" && (e as ToolData).id === toolId && !(e as ToolData).isComplete);
                if (idx >= 0) {
                  (next[idx] as ToolData).partialResult = data.partialResult;
                }
                break;
              }
              case "tool_end": {
                const toolId = data.id as string;
                const idx = next.findIndex((e) => e.type === "tool" && (e as ToolData).id === toolId && !(e as ToolData).isComplete);
                if (idx >= 0) {
                  (next[idx] as ToolData).result = data.result;
                  (next[idx] as ToolData).isError = !!data.isError;
                  (next[idx] as ToolData).isComplete = true;
                }
                break;
              }
              case "done": {
                // Seal the last thinking/msg entity
                for (let i = next.length - 1; i >= 0; i--) {
                  next[i].sealed = true;
                }
                setEndFlag(true);
                break;
              }
              case "error": {
		for (let i = next.length - 1; i >= 0; i--) {
                  next[i].sealed = true;
                }
                setEndFlag(true);
                break;
              }
            }
            return next;
          });
        },
        (err: Error) => {
	  for (let i = entities.length - 1; i >= 0; i--) {
              entities[i].sealed = true;
          }
          setEndFlag(true);
        },
      );

      return abortStream;
    },
    [isProcessing, resetState],
  );

  return { entities, endFlag, sessionId, handleSend, resetState };
}
