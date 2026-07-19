import { Dispatch, RefObject, SetStateAction } from "react";
import type { ChatState, Session } from "../../../types";
import { getSessions } from "../../../api";
import { loadSessionHistory } from "@/frontend/hooks/useSessionHistory";

export const PAGE_SIZE = 20;

export function getSessionNameChangeHandler(setSessions: Dispatch<SetStateAction<Session[]>>): (session: Session) => void {
  return (session: Session) => {
    const updatedAt = session.updated_at || new Date().toISOString();
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === session.id);
      if (existing) {
        return [
          { id: session.id, name: session.name, updated_at: updatedAt },
          ...prev.filter((s) => s.id !== session.id),
        ];
      }
      return [{ id: session.id, name: session.name, updated_at: updatedAt }, ...prev];
    });
    // Update URL hash so session can be resumed after refresh.
    // Use replaceState to avoid triggering hashchange events mid-stream.
    if (window.location.hash !== `#${session.id}`) {
      window.history.replaceState(null, "", `#${session.id}`);
    }
  };
}

// ── Lazy session loading (page renders first, then sessions fetch async) ──
export function getMoreSessionHndlr(loadMoreOffsetRef: RefObject<number>, setSessions: Dispatch<SetStateAction<Session[]>>, setSessionTotal: Dispatch<SetStateAction<number>>): (loadMore?: boolean) => Promise<void> {
  return async (loadMore = false) => {
    try {
      const offset = loadMore ? loadMoreOffsetRef.current : 0;
      const result = await getSessions(PAGE_SIZE, offset);
      const data = result as { sessions: Session[]; total: number; };
      if (loadMore) {
        setSessions((prev) => [...prev, ...data.sessions]);
      } else {
        setSessions(data.sessions);
      }
      loadMoreOffsetRef.current = offset + data.sessions.length;
      setSessionTotal(data.total);
    } catch (err){
      console.log('error loading more sessions... ',err)
    }
  };
}
export function getReloadSessionsHndlr(loadMoreOffsetRef: RefObject<number>, loadSessions: (loadMore?: boolean) => Promise<void>): () => void {
  return () => {
    loadMoreOffsetRef.current = 0;
    loadSessions(false);
  };
}
export function getResumeSessionHandler(setChatState: Dispatch<SetStateAction<ChatState>>, setCurrentSessionId: Dispatch<SetStateAction<string | null>>, resetState: () => void) {
  return async (sessionId: string | null) => {
    if (sessionId === null) {
      setChatState({ records: [] });
      setCurrentSessionId(null);
      resetState();
      return;
    }
    window.location.hash = sessionId;
  };
}
export function getLoadSessionHandler(currentSessionId: string | null, setChatState: Dispatch<SetStateAction<ChatState>>, setCurrentSessionId: Dispatch<SetStateAction<string | null>>, reloadSessions: () => void) {
  return async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    try {
      const state = await loadSessionHistory(sessionId);
      setChatState(state);
      setCurrentSessionId(sessionId);
      reloadSessions();
    } catch (err) {
      console.error("Failed to load session:", err);
      window.location.hash = "";
    }
  };
}

