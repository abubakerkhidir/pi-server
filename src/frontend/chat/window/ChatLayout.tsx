import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, getModels, getSessions, getUsername, summarizeSession } from "@/frontend/api";
import type { ChatLayoutProps, UserSettings, ChatState, ChatRecord, Session, TokenStats, SessionTokenStats, ModelInfo } from "@/frontend/types";

import ChatSidebar from "../../sidebar/ChatSidebar";
import ChatHeader from "./ChatHeader";
import ChatWindow, {  scrollToBtm } from "./ChatWindow";
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
  let total_text = 0;
  let ttftSum = 0;
  let ttftCount = 0;

  for (const rec of records) {
    const ts = rec.agentReply.tokenStats;
    if (ts) {
      total_prompt += ts.prompt_tokens;
      total_think += ts.think_tokens;
      total_text += ts.output_tokens;
      if (ts.ttft_ms) {
        ttftSum += ts.ttft_ms;
        ttftCount++;
      }
    } else {
      // Fallback estimate if no token stats yet (streaming in progress)
      total_prompt += estimateTokens(rec.userMsg.content);
      for (const ent of rec.agentReply.entities) {
        if (ent.type === "think") total_think += estimateTokens(ent.content);
        if (ent.type === "msg") total_text += estimateTokens(ent.content);
      }
    }
  }

  // total-output is the sum of think + text (msg)
  const totalUsed = total_prompt + total_think + total_text;
  const contextSize = 128000; // default; can be refined from model info
  const context_used_pct = Math.round((totalUsed / contextSize) * 100);

  return {
    total_prompt,
    total_think,
    total_output: total_think + total_text,
    total_text,
    context_used_pct: Math.min(context_used_pct, 100),
    context_size: contextSize,
    ttft_avg_ms: ttftCount > 0 ? Math.round(ttftSum / ttftCount) : 0,
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
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const pendingSummaryRef = useRef<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
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
    Promise.all([getSettings(), getModels()])
      .then(([s, m]) => {
        const settings = s as UserSettings;
        setUserSettings({ ...userSettings, ...settings });
        const allModels = ((m as { groups: { models: ModelInfo[] }[] }).groups || []).flatMap(
          (g) => g.models,
        );
        if (allModels.length > 0) {
          const found = settings.model_id
            ? allModels.find((model) => model.id === settings.model_id)
            : undefined;
          setCurrentModel(found || allModels[0]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { handleSend, stopStream, resetState } = useChatStream({
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
      console.log('handleSend: ', isProcessing, prompt)
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
      const userRecord: ChatRecord = {
        id: userId,
        userMsg: { content: finalPrompt },
        agentReply: { id: "", entities: [] },
      };
      setChatState((prev) => ({ records: [...prev.records, userRecord] }));

      setIsProcessing(true);
      handleSend(
        finalPrompt,
        files && files.length > 0 ? files : undefined,
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
    setTimeout(()=>{scrollToBtm();setTimeout(()=>{scrollToBtm()},500)},500)
  };

  const handleSummarizeAndNew = useCallback(async () => {
    const oldSessionId = currentSessionIdRef.current;
    if (!oldSessionId) {
      // No active session, just create a new one
      handleNewChat();
      return;
    }

    setSummarizing(true);
    try {
      const result = await summarizeSession(oldSessionId);
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
  }, [handleNewChat]);

  const handleResumeSession = async (sessionId: string | null) => {
    if (sessionId === null) {
      setChatState({ records: [] });
      setCurrentSessionId(null);
      resetState();
      return;
    }
    window.location.hash = sessionId;
  };

  const handleModelSelect = (model: ModelInfo) => setCurrentModel(model);

  const handleStop = useCallback(() => {
    stopStream();
    setIsProcessing(false);
  }, [stopStream]);

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
          currentModel={currentModel?.name || "Select a model"}
          onModelSelect={handleModelSelect}
          modelInfo={currentModel}
          onSummarizeAndNew={handleSummarizeAndNew}
          summarizing={summarizing}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <ChatWindow chatState={chatState} userSettings={userSettings} onScrollAwayChange={setShowScrollDown} showScrollDown={showScrollDown}/>
        <InputArea
          onSend={handleSendWrapper}
          onStop={handleStop}
          disabled={isProcessing}
          value={userPrompt}
          onValueChange={setUserPrompt}
          uploadedFiles={uploadedFiles}
          onAddFile={(files) => setUploadedFiles((prev) => [...prev, ...files])}
          onRemoveFile={(index) => setUploadedFiles((prev) => prev.filter((_, i) => i !== index))}
          sessionStats={sessionStats}
          showScrollDown={showScrollDown}
          setShowScrollDown={setShowScrollDown}
        />
      </div>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} onSave={(s) => setUserSettings({ ...userSettings, ...s })} onResumeSession={handleResumeSession} onSettingsChange={setUserSettings}/>
    </div>
  );
}
