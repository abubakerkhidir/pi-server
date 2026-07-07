import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, getModels, getSessions, getUsername } from "@/frontend/api";
import type { ChatLayoutProps, UserSettings, ChatState, ChatRecord, Session, TokenStats, SessionTokenStats } from "@/frontend/types";
import ChatSidebar from "../../sidebar/ChatSidebar";
import ChatHeader from "./ChatHeader";
import ChatWindow from "./ChatWindow";
import InputArea from "../input/InputArea";
import SettingsModal from "../../config/settings/SettingsModal";
import { useChatStream } from "@/frontend/hooks/useChatStream";
import { loadSessionHistory } from "@/frontend/hooks/useSessionHistory";
import { v4 as uuidv4 } from "uuid";

const PAGE_SIZE = 20;

/** Heuristic: estimate tokens from text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compute session-level token stats from all records.
 */
function computeSessionStats(records: ChatRecord[]): SessionTokenStats | undefined {
  if (records.length === 0) return undefined;

  let total_prompt = 0;
  let total_think = 0;
  let total_output = 0;

  for (const rec of records) {
    const ts = rec.agentReply.tokenStats;
    if (ts) {
      total_prompt += ts.prompt_tokens;
      total_think += ts.think_tokens;
      total_output += ts.output_tokens;
    } else {
      // Fallback estimate if no token stats yet (streaming in progress)
      total_prompt += estimateTokens(rec.userMsg.content);
      for (const ent of rec.agentReply.entities) {
        if (ent.type === "think") total_think += estimateTokens(ent.content);
        if (ent.type === "msg") total_output += estimateTokens(ent.content);
      }
    }
  }

  const totalUsed = total_prompt + total_think + total_output;
  const contextSize = 128000; // default; can be refined from model info
  const context_used_pct = Math.round((totalUsed / contextSize) * 100);

  return {
    total_prompt,
    total_think,
    total_output,
    context_used_pct: Math.min(context_used_pct, 100),
    context_size: contextSize,
  };
}

export default function ChatLayout({ onLogout }: ChatLayoutProps) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionsLoaded, setSessionsLoaded] = useState(false); // lazy init flag
  const [userSettings, setUserSettings] = useState<UserSettings>({
    tools_enabled: [],
    thinking_lines: 3,
    tool_lines: 5,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState("Coding Agent");

  // Sidebar collapsed by default on narrow screens (< 800px)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 800);

  // Listen for resize to auto-collapse below 800px
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 799px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    if (mq.matches) setSidebarCollapsed(true);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [userPrompt, setUserPrompt] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);

  // Chat state
  const [chatState, setChatState] = useState<ChatState>({ records: [] });

  // Session-level token stats derived from records
  const sessionStats = computeSessionStats(chatState.records);

  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const isProcessingRef = useRef(isProcessing);
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Track next offset for pagination
  const loadMoreOffsetRef = useRef(0);

  // ── Lazy session loading (page renders first, then sessions fetch async) ──
  const loadSessions = useCallback(async (loadMore = false) => {
    try {
      const offset = loadMore ? loadMoreOffsetRef.current : 0;
      const result = await getSessions(PAGE_SIZE, offset);
      const data = result as { sessions: Session[]; total: number };
      if (loadMore) {
        setSessions((prev) => [...prev, ...data.sessions]);
      } else {
        setSessions(data.sessions);
      }
      loadMoreOffsetRef.current = offset + data.sessions.length;
      setSessionTotal(data.total);
      setSessionsLoaded(true);
    } catch {
      /* ignore */
    }
  }, []);

  const reloadSessions = useCallback(() => {
    loadMoreOffsetRef.current = 0;
    loadSessions(false);
  }, [loadSessions]);

  // Initial fetch — runs after mount, doesn't block render
  useEffect(() => {
    loadSessions(false);
  }, [loadSessions]);

  useEffect(() => {
    getSettings()
      .then((s) => setUserSettings({ ...userSettings, ...(s as UserSettings) }))
      .catch(() => {});
    getModels()
      .then((r) => {
        const first = ((r as { groups: { models: { name: string }[] }[] }).groups || []).flatMap(
          (g) => g.models,
        )[0];
        if (first) setCurrentModel(first.name);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { handleSend, resetState } = useChatStream({
    currentSessionId: currentSessionId || null,
    userSettings,
  });

  const handleStreamEnd = useCallback(() => {
    setIsProcessing(false);
    // Ensure URL hash reflects the session (in case session_name didn't fire)
    const sid = currentSessionIdRef.current;
    if (sid && window.location.hash !== `#${sid}`) {
      window.history.replaceState(null, "", `#${sid}`);
    }
  }, []);

  const onEntityUpdate = useCallback(
    (entities: import("@/frontend/types").AgentReplyEntity[]) => {
      setChatState((prev) => {
        const last = prev.records[prev.records.length - 1];
        if (!last) return prev;
        last.agentReply.entities = entities;
        return { records: [...prev.records] };
      });
    },
    [],
  );

  const onTokenStats = useCallback(
    (stats: TokenStats) => {
      setChatState((prev) => {
        const last = prev.records[prev.records.length - 1];
        if (!last) return prev;
        last.agentReply.tokenStats = stats;
        return { records: [...prev.records] };
      });
    },
    [],
  );

  const handleSessionName = useCallback(
    (session: Session) => {
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
    },
    [],
  );

  const handleSendWrapper = useCallback(
    (prompt: string, files: File[]) => {
      if (!prompt || isProcessing) return;
      setUserPrompt("");

      const userId = uuidv4();
      const userRecord: ChatRecord = {
        id: userId,
        userMsg: { content: prompt },
        agentReply: { id: "", entities: [] },
      };
      setChatState((prev) => ({ records: [...prev.records, userRecord] }));

      setIsProcessing(true);
      handleSend(
        prompt,
        files,
        onEntityUpdate,
        handleStreamEnd,
        handleSessionName,
        (sessionId) => {
          // Update currentSessionId so follow-up messages reuse this session.
          // Don't set window.location.hash here — that would trigger a hashchange
          // event mid-stream and cause a history reload race.
          setCurrentSessionId(sessionId);
        },
        onTokenStats,
      );
    },
    [isProcessing, handleSend, onEntityUpdate, handleStreamEnd, handleSessionName, onTokenStats],
  );

  const handleNewChat = () => {
    setChatState({ records: [] });
    setCurrentSessionId(null);
    resetState();
    reloadSessions();
    // Clear URL hash so a fresh session will be created
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const handleResumeSession = async (sessionId: string | null) => {
    if (sessionId === null) {
      setChatState({ records: [] });
      setCurrentSessionId(null);
      resetState();
      return;
    }
    window.location.hash = sessionId;
  };

  const handleModelSelect = (model: { name: string }) => setCurrentModel(model.name);

  const loadAndShowSession = async (sessionId: string) => {
    if (sessionId === currentSessionIdRef.current) return;
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

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const username = getUsername();

  return (
    <div className="chat-layout">
      <ChatSidebar
        sessions={sessions}
        sessionTotal={sessionTotal}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSessionClick={(id) => {
          window.location.hash = id;
        }}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onRenameComplete={reloadSessions}
        onLoadMore={() => loadSessions(true)}
      />
      <div className="main-area" id="mainArea">
        <ChatHeader
          username={username}
          onSettingsClick={() => setShowSettings(true)}
          onLogout={onLogout}
          currentModel={currentModel}
          onModelSelect={handleModelSelect}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <ChatWindow
          chatState={chatState}
          userSettings={userSettings}
          onScrollAwayChange={setShowScrollDown}
          showScrollDown={showScrollDown}
          onScrollDownClick={() => {
            const el = document.getElementById("chatMessages");
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
        />
        <InputArea
          onSend={handleSendWrapper}
          disabled={isProcessing}
          value={userPrompt}
          onValueChange={setUserPrompt}
          uploadedFiles={[]}
          onRemoveFile={() => {}}
          sessionStats={sessionStats}
        />
      </div>
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={(s) => setUserSettings({ ...userSettings, ...s })}
        onResumeSession={handleResumeSession}
        onSettingsChange={setUserSettings}
      />
    </div>
  );
}
