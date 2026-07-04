import { useState, useEffect, useRef, useCallback } from "react";
import { getSettings, getModels, getSessions, clearAuth, getUsername } from "@/frontend/api";
import type { ChatLayoutProps, UserSettings } from "@/frontend/types";
import ChatSidebar from "../../sidebar/ChatSidebar";
import ChatHeader from "./ChatHeader";
import ChatWindow from "./ChatWindow";
import InputArea from "../input/InputArea";
import SettingsModal from "../../config/settings/SettingsModal";
import { useChatStream } from "@/frontend/hooks/useChatStream";
import { loadSessionHistory } from "@/frontend/hooks/useSessionHistory";

export default function ChatLayout({ onLogout }: ChatLayoutProps) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [sessions, setSessions] = useState<{ id: string; name: string | null; updated_at: string }[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({ tools_enabled: [], thinking_lines: 3, tool_lines: 5 });
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState("Coding Agent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Keep a mutable ref to current session ID to avoid stale closure
  const currentSessionIdRef = useRef<string | null>(null);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  const chatRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    try { setSessions(await getSessions() as { id: string; name: string | null; updated_at: string }[]); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    getSettings().then((s) => setUserSettings({ ...userSettings, ...(s as UserSettings) })).catch(() => {});
    getModels().then((r) => { const first = ((r as { groups: { models: { name: string }[] }[] }).groups || []).flatMap((g) => g.models)[0]; if (first) setCurrentModel(first.name); }).catch(() => {});
  }, []);

  const { handleSend, handleNewChat } = useChatStream({
    currentSessionId: currentSessionId || null,
    isProcessing, userSettings,
    chatRef, welcomeRef,
    setCurrentSessionId, setIsProcessing, setUploadedFiles, loadSessions,
  });

  const removeFile = (index: number) => setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  const handleSettingsSave = (s: Record<string, unknown>) => setUserSettings({ ...userSettings, ...s });

  const handleResumeSession = async (sessionId: string | null) => {
    console.log("[ChatLayout] handleResumeSession:", sessionId, "current:", currentSessionIdRef.current);
    if (sessionId === null) { setCurrentSessionId(null); welcomeRef.current?.style.setProperty("display", ""); chatRef.current?.querySelectorAll(".message")?.forEach((m) => m.remove()); return; }
    await loadSessionHistory(sessionId, currentSessionIdRef.current, chatRef, welcomeRef, setCurrentSessionId, loadSessions);
  };

  const handleModelSelect = (model: { name: string }) => setCurrentModel(model.name);
  const username = getUsername();

  return (
    <div className="chat-layout">
      <ChatSidebar sessions={sessions} currentSessionId={currentSessionId} onNewChat={handleNewChat} onSessionClick={(id) => loadSessionHistory(id, currentSessionIdRef.current, chatRef, welcomeRef, setCurrentSessionId, loadSessions)} onLogout={onLogout} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onRenameComplete={loadSessions} />
      <button className="sidebar-toggle-floating" onClick={() => setSidebarCollapsed(false)}>☰</button>
      <div className={`main-area ${sidebarCollapsed ? "main-area" : ""}`} id="mainArea" style={sidebarCollapsed ? { paddingLeft: 50 } : {}}>
        <ChatHeader username={username} onSettingsClick={() => setShowSettings(true)} onLogout={onLogout} currentModel={currentModel} onModelSelect={handleModelSelect} />
        <ChatWindow chatRef={chatRef} welcomeRef={welcomeRef} />
        <InputArea onSend={handleSend} disabled={isProcessing} value={userPrompt} onValueChange={setUserPrompt} uploadedFiles={uploadedFiles} onRemoveFile={removeFile} />
      </div>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} onSave={handleSettingsSave} onResumeSession={handleResumeSession} onSettingsChange={setUserSettings} />
    </div>
  );
}
