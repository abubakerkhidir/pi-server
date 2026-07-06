import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, getModels, getSessions, getUsername } from "@/frontend/api";
import type { ChatLayoutProps, UserSettings, ChatState, ChatRecord } from "@/frontend/types";
import ChatSidebar from "../../sidebar/ChatSidebar";
import ChatHeader from "./ChatHeader";
import ChatWindow from "./ChatWindow";
import InputArea from "../input/InputArea";
import SettingsModal from "../../config/settings/SettingsModal";
import { useChatStream } from "@/frontend/hooks/useChatStream";
import { loadSessionHistory } from "@/frontend/hooks/useSessionHistory";
import { v4 as uuidv4 } from "uuid";

export default function ChatLayout({ onLogout }: ChatLayoutProps) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; name: string | null; updated_at: string }[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({ tools_enabled: [], thinking_lines: 3, tool_lines: 5 });
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState("Coding Agent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");

  // Chat state
  const [chatState, setChatState] = useState<ChatState>({ records: [] });

  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  const loadSessions = useCallback(async () => {
    try { setSessions(await getSessions() as { id: string; name: string | null; updated_at: string }[]); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    getSettings().then((s) => setUserSettings({ ...userSettings, ...(s as UserSettings) })).catch(() => {});
    getModels().then((r) => {
      const first = ((r as { groups: { models: { name: string }[] }[] }).groups || []).flatMap((g) => g.models)[0];
      if (first) setCurrentModel(first.name);
    }).catch(() => {});
  }, []);

  const { handleSend, resetState } = useChatStream({
    currentSessionId: currentSessionId || null,
    userSettings,
  });

  /* ── onStreamEnd — sets isProcessing = false when stream finishes ── */
  const handleStreamEnd = useCallback(() => {
    setIsProcessing(false);
  }, []);

  /* ── onEntityUpdate — called after EVERY SSE event for streaming UI updates ── */
  const onEntityUpdate = useCallback((entities: import("@/frontend/types").AgentReplyEntity[]) => {
    setChatState((prev) => {
      const last = prev.records[prev.records.length - 1];
      if (!last) return prev;
      last.agentReply.entities = entities;
      return { records: [...prev.records] };
    });
  }, []);

  /* ── Send handler ──────────────────────────────────────
   *
   * 1. Create a ChatRecord (empty agentReply) so the UI has a placeholder
   * 2. Fire up the stream — onEntityUpdate fires for each SSE token
   * 3. handleStreamEnd is called when done/error/abort
   */
  const handleSendWrapper = useCallback(
    (prompt: string, files: File[]) => {
      if (!prompt || isProcessing) return;

      // Create record (empty agentReply)
      const userId = uuidv4();
      const userRecord: ChatRecord = {
        id: userId,
        userMsg: { content: prompt },
        agentReply: { id: "", entities: [] },
      };
      setChatState((prev) => ({ records: [...prev.records, userRecord] }));

      // Start streaming
      setIsProcessing(true);
      handleSend(prompt, files, onEntityUpdate, handleStreamEnd);
    },
    [isProcessing, handleSend, onEntityUpdate, handleStreamEnd],
  );

  /* ── Session / sidebar handlers ──────────────────────── */
  const handleNewChat = () => {
    setChatState({ records: [] });
    setCurrentSessionId(null);
    resetState();
    loadSessions();
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

  /* ── Session loading ─────────────────────────────────── */
  const loadAndShowSession = async (sessionId: string) => {
    if (sessionId === currentSessionIdRef.current) return;
    try {
      const state = await loadSessionHistory(sessionId);
      setChatState(state);
      setCurrentSessionId(sessionId);
      loadSessions();
    } catch (err) {
      console.error("Failed to load session:", err);
      window.location.hash = "";
    }
  };

  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      await loadAndShowSession(hash);
    };
    window.addEventListener("hashchange", handleHashChange);
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash) loadAndShowSession(initialHash);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const username = getUsername();

  return (
    <div className="chat-layout">
      <ChatSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSessionClick={(id) => { window.location.hash = id; }}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onRenameComplete={loadSessions}
      />
      <button className="sidebar-toggle-floating" onClick={() => setSidebarCollapsed(false)}>☰</button>
      <div className={`main-area ${sidebarCollapsed ? "main-area" : ""}`} id="mainArea" style={sidebarCollapsed ? { paddingLeft: 50 } : {}}>
        <ChatHeader
          username={username}
          onSettingsClick={() => setShowSettings(true)}
          onLogout={onLogout}
          currentModel={currentModel}
          onModelSelect={handleModelSelect}
        />
        <ChatWindow chatState={chatState} userSettings={userSettings} />
        <InputArea
          onSend={handleSendWrapper}
          disabled={isProcessing}
          value={userPrompt}
          onValueChange={setUserPrompt}
          uploadedFiles={[]}
          onRemoveFile={() => {}}
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
