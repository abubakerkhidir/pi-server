import { summarizeSession } from "@/frontend/api";
import type { ChatState } from "@/frontend/types";
import { RefObject, Dispatch, SetStateAction } from "react";
import { scrollToBtm } from "./scrollUtils";


export function getSummarizeAndNewHandler(currentSessionId: string | null, handleNewChat: () => void, setSummarizing: Dispatch<SetStateAction<boolean>>, pendingSummaryRef: RefObject<string | null>): () => Promise<void> {
  return async () => {
    if (!currentSessionId) {
      // No active session, just create a new one
      handleNewChat();
      return;
    }
    setSummarizing(true);
    try {
      const result = await summarizeSession(currentSessionId);
      if (result.summary) {
        pendingSummaryRef.current = result.summary;
      }
    } catch (err) {
      console.error("Summarization failed:", err);
      // Still start a new session even if summarization fails
    } finally {
      setSummarizing(false);
    }
    handleNewChat();
  };
}

export function getNewChatHandler(setChatState: Dispatch<SetStateAction<ChatState>>, setCurrentSessionId: Dispatch<SetStateAction<string | null>>, resetState: () => void, reloadSessions: () => void, setShowScrollDown: Dispatch<SetStateAction<boolean>>) {
  return () => {
    setChatState({ records: [] });
    setCurrentSessionId(null);
    resetState();
    reloadSessions();
    setShowScrollDown(false);
    // Clear URL hash so a fresh session will be created
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setTimeout(() => { scrollToBtm(); setTimeout(() => { scrollToBtm(); }, 500); }, 500);
  };
}export function getPageUrlHashEffect(isProcessingRef: RefObject<boolean>, loadAndShowSession: (sessionId: string) => Promise<void>): import("react").EffectCallback {
  return () => {
    const handleHashChange = async () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      // Don't reload session mid-stream — that would wipe the streaming state
      if (isProcessingRef.current) return;
      await loadAndShowSession(hash);
    };
    window.addEventListener("hashchange", handleHashChange);
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash) loadAndShowSession(initialHash);
    return () => window.removeEventListener("hashchange", handleHashChange);
  };
}

