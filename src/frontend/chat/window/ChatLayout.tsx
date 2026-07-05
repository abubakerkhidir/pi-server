import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, getModels, getSessions, clearAuth, getUsername } from "@/frontend/api";
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
  const [userPrompt, setUserPrompt] = useState("");
  const [sessions, setSessions] = useState<{ id: string; name: string | null; updated_at: string }[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({ tools_enabled: [], thinking_lines: 3, tool_lines: 5 });
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState("Coding Agent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat state: array of records (userMsg + agentReply)
  const [chatState, setChatState] = useState<ChatState>({ records: [] });

  const currentSessionIdRef = useRef<string | null>(null);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // Track if we've already finalized a stream to avoid duplicate records
  const finalizedIdsRef = useRef<Set<string>>(new Set());

  const loadSessions = useCallback(async () => {
    try { setSessions(await getSessions() as { id: string; name: string | null; updated_at: string }[]); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    getSettings().then((s) => setUserSettings({ ...userSettings, ...(s as UserSettings) })).catch(() => {});
    getModels().then((r) => { const first = ((r as { groups: { models: { name: string }[] }[] }).groups || []).flatMap((g) => g.models)[0]; if (first) setCurrentModel(first.name); }).catch(() => {});
  }, []);

  const { entities, endFlag, sessionId, handleSend, resetState } = useChatStream({
    currentSessionId: currentSessionId || null,
    isProcessing,
    userSettings,
  });

  // When stream ends, save the full entity list as an AgentReply
  const wasProcessedRef = useRef(false);
  useEffect(() => {
    //if (!endFlag || wasProcessedRef.current) return;
    //wasProcessedRef.current = true;

    if (entities.length > 0) {
      setChatState((prev) => {
	   const last = prev[prev.length - 1];
	   last.agentReply.entities = entities;
	   return [...prev];
      });

      //const replyId = uuidv4();
      //const newRecord: ChatRecord = {
      //  id: replyId,
      //  userMsg: { content: "" },
      // agentReply: { id: replyId, entities: [...entities] },
      //};
      //setChatState((prev) => ({ records: [...prev.records, newRecord] }));
    }
    if(endFlag){
	setChatState((prev) => {
           const last = prev[prev.length - 1];
           last.agentReply.replyId = uuidv4();
           return [...prev];
        })
    }
  }, [endFlag, entities]);

  // Handle hash changes for session loading
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.replace("#", "");
      if (!hash) return;
      await loadAndShowSession(hash);
    };

    window.addEventListener("hashchange", handleHashChange);
    // Check initial hash
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash) loadAndShowSession(initialHash);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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

  const handleSendWrapper = useCallback(async (prompt: string, files: File[]) => {
    if (!prompt || isProcessing) return;

    // Create user message record
    const userId = uuidv4();
    const userRecord: ChatRecord = {
      id: userId,
      userMsg: { content: prompt },
      agentReply: { id: "", entities: [] },
    };
    setChatState((prev) => ({ records: [...prev.records, userRecord] }));

    // Reset tracking for new stream
    wasProcessedRef.current = false;

    // Start the stream (populates entities in useChatStream, sets endFlag when done)
    setIsProcessing(true);
    await handleSend(prompt, files);
    setIsProcessing(false);
  }, [isProcessing, handleSend]);

  const handleNewChat = () => {
    setChatState({ records: [] });
    setCurrentSessionId(null);
    resetState();
    wasProcessedRef.current = false;
    loadSessions();
  };

  const handleResumeSession = async (sessionId: string | null) => {
    if (sessionId === null) {
      setChatState({ records: [] });
      setCurrentSessionId(null);
      resetState();
      wasProcessedRef.current = false;
      return;
    }
    window.location.hash = sessionId;
  };

  const handleModelSelect = (model: { name: string }) => setCurrentModel(model.name);
  const username = getUsername();

  return (
    <div className="chat-layout">
      <ChatSidebar sessions={sessions} currentSessionId={currentSessionId} onNewChat={handleNewChat} onSessionClick={(id) => { window.location.hash = id; }} onLogout={onLogout} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onRenameComplete={loadSessions} />
      <button className="sidebar-toggle-floating" onClick={() => setSidebarCollapsed(false)}>☰</button>
      <div className={`main-area ${sidebarCollapsed ? "main-area" : ""}`} id="mainArea" style={sidebarCollapsed ? { paddingLeft: 50 } : {}}>
        <ChatHeader username={username} onSettingsClick={() => setShowSettings(true)} onLogout={onLogout} currentModel={currentModel} onModelSelect={handleModelSelect} />
        <ChatWindow chatState={chatState} userSettings={userSettings} />
        <InputArea onSend={handleSendWrapper} disabled={isProcessing} value={userPrompt} onValueChange={setUserPrompt} uploadedFiles={[]} onRemoveFile={() => {}} />
      </div>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} onSave={(s) => setUserSettings({ ...userSettings, ...s })} onResumeSession={handleResumeSession} onSettingsChange={setUserSettings} />
    </div>
  );
}
