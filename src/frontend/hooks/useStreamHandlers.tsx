import { Dispatch, SetStateAction, RefObject, useCallback } from "react";
import type { ChatState, AgentReplyEntity } from "../types";


export function useStreamEndHandler(setIsProcessing: Dispatch<SetStateAction<boolean>>, currentSessionId: string|null) {
  return useCallback(() => {
    console.log('got stream-end event...')
    setIsProcessing(false);
    // Ensure URL hash reflects the session (in case session_name didn't fire)
    const sid = currentSessionId;
    if (sid && window.location.hash !== `#${sid}`) {
      console.log('replace window url hash: ',window.location.hash, sid)
      window.history.replaceState(null, "", `#${sid}`);
    }
  }, [currentSessionId]);
}

export function useOnEntityUpdate(setChatState: Dispatch<SetStateAction<ChatState>>) {
  return useCallback((entities: AgentReplyEntity[]) => {
    //console.log('got stream: ');
    setChatState((prev) => {
      const last = prev.records[prev.records.length - 1];
      if (!last) return prev;
      last.agentReply.entities = entities;
      return { records: [...prev.records] };
    });
  }, []);
}

export function useStopStream(stopStream: () => void, setIsProcessing: Dispatch<SetStateAction<boolean>>) {
  return useCallback(() => {
    stopStream();
    setIsProcessing(false);
  }, [stopStream]);
}

