import { OnSendInput } from "@/frontend/hooks/useChatStream";
import { AgentReplyEntity, ChatState } from "@/frontend/types";
import { Dispatch, RefObject, SetStateAction, useCallback } from "react";
import type { ChatRecord, Session, TokenStats } from "../../../types";
import { v4 as uuidv4 } from "uuid";
import { useOnEntityUpdate, useStreamEndHandler } from "@/frontend/hooks/useStreamHandlers";
import { getSessionNameChangeHandler } from "./sessionMngmtUtils";
import { getOnTokenStatsHndlr } from "./tokenStatsUtil";


export interface OnSendWrapperInput {
  isProcessing: boolean;
  setUserPrompt: Dispatch<SetStateAction<string>>;
  setUploadedFiles: Dispatch<SetStateAction<File[]>>;
  pendingSummaryRef: RefObject<string | null>;
  setChatState: Dispatch<SetStateAction<ChatState>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  handleSend: (prms: OnSendInput) => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  currentSessionId:string|null,
}

export function useHandleSend(p: OnSendWrapperInput) {
  const { isProcessing, setUserPrompt, setUploadedFiles, pendingSummaryRef, setChatState, setIsProcessing, handleSend, setSessions, setCurrentSessionId,currentSessionId }= p
  const onEntityUpdate = useOnEntityUpdate(setChatState);
  const handleStreamEnd = useStreamEndHandler(setIsProcessing, currentSessionId);
  const handleSessionName = useCallback(getSessionNameChangeHandler(setSessions),[]);
  const onTokenStats = useCallback(getOnTokenStatsHndlr(setChatState), []);
  return useCallback(
    (prompt: string, files: File[]) => {
      console.log('handleSend: ', isProcessing, prompt);
      if (isProcessing) return;
      // Allow file-only uploads (empty prompt with files)
      if (!prompt && (!files || files.length === 0)) return;

      if (prompt) setUserPrompt("");
      // Clear uploaded files after sending
      if (files && files.length > 0) setUploadedFiles([]);

      // If there's a pending summary from a previous session, prepend it
      const pendingSummary = pendingSummaryRef.current;
      let finalPrompt = prompt || "[File attachment]";
      if (pendingSummary) {
        finalPrompt = `###Previous session summary:\n${pendingSummary}\n\n###New Task\n\n${finalPrompt}`;
        pendingSummaryRef.current = null; // consume it once
      }

      const userId = uuidv4();
      const userRecord: ChatRecord = {id: userId,userMsg: { content: finalPrompt },agentReply: { id: "", entities: [] }};
      setChatState((prev) => ({ records: [...prev.records, userRecord],sessionStats:prev.sessionStats }));
      setIsProcessing(true);
      handleSend({
        prompt: finalPrompt, files: files && files.length > 0 ? files : undefined, onEntityUpdate, onStreamEnd: handleStreamEnd,onSessionName: handleSessionName, 
        onTokenStats, onSessionCreated:(sessionId) => {setCurrentSessionId(sessionId);}, 
      });
    }, [isProcessing, handleSend, onEntityUpdate, handleStreamEnd, handleSessionName, onTokenStats]
  );
}
