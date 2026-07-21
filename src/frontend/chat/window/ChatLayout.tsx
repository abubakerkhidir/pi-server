import { changeSessionModel, getUsername } from "@/frontend/api";
import type { ChatLayoutProps, ChatState, ModelInfo, Session, UserSettings } from "@/frontend/types";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { getLoadSessionHandler, getMoreSessionHndlr, getReloadSessionsHndlr, getResumeSessionHandler } from "@/frontend/chat/window/chat-utils/sessionMngmtUtils";
import { useChatStream } from "@/frontend/hooks/useChatStream";
import { useStopStream } from "@/frontend/hooks/useStreamHandlers";
import SettingsModal from "../../config/settings/SettingsModal";
import ChatSidebar from "../../sidebar/ChatSidebar";
import InputArea from "../input/InputArea";
import { getNewChatHandler, getPageUrlHashEffect, getSummarizeAndNewHandler } from "./chat-utils/newChatUtils";
import { useHandleSend } from "./chat-utils/useSendUtils";
import ChatHeader from "./ChatHeader";
import ChatWindow from "./ChatWindow";

const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export default function ChatLayout({ onLogout, onShowFiles }: ChatLayoutProps) {
  //state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [userSettings, setUserSettings] = useState<UserSettings>({tools_enabled: [],thinking_lines: 3,tool_lines: 5});
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [currentThinkLevel, setCurrentThinkLevel] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 800);
  const [userPrompt, setUserPrompt] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatState, setChatState] = useState<ChatState>({ records: [] });
  const pendingSummaryRef = useRef<string | null>(null);
  const loadMoreOffsetRef = useRef(0);
  const allModelsRef = useRef<{ provider: string; models: ModelInfo[] }[]>([]);

  //callback functions
  const { handleSend, stopStream, resetState } = useChatStream({currentSessionId,userSettings,modelId: currentModel?.id,modelProvider: currentModel?.provider,thinkLevel: currentThinkLevel ?? undefined });
  const loadSessions = useCallback(getMoreSessionHndlr(loadMoreOffsetRef, setSessions, setSessionTotal), []);
  const reloadSessions = useCallback(getReloadSessionsHndlr(loadMoreOffsetRef, loadSessions), [loadSessions]);
  const handleSendWrapper = useHandleSend({ isProcessing, setUserPrompt, setUploadedFiles, pendingSummaryRef, setChatState, setIsProcessing, handleSend, setSessions, setCurrentSessionId,currentSessionId });
  const handleNewChat = getNewChatHandler(setChatState, setCurrentSessionId, resetState, reloadSessions, setShowScrollDown)
  const handleSummarizeAndNew = useCallback(getSummarizeAndNewHandler(currentSessionId, handleNewChat, setSummarizing, pendingSummaryRef), [handleNewChat]);
  const handleResumeSession = getResumeSessionHandler(setChatState, setCurrentSessionId, resetState);
  const handleStopStream = useStopStream(stopStream, setIsProcessing);
  const loadAndShowSession = getLoadSessionHandler(currentSessionId, setChatState, setCurrentSessionId, reloadSessions);
  const username = getUsername();

  //effects
  useEffect(sideBarResizeListner(setSidebarCollapsed), []);
  useEffect(() => {loadSessions(false);}, [loadSessions]);  // Initial fetch — runs after mount, doesn't block render
  useEffect(getSettingsLoaderFun(setUserSettings, userSettings, setCurrentModel), []);
  useEffect(getPageUrlHashEffect(isProcessing, loadAndShowSession), []);

  // Effect: Load defaults from settings and set initial model
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const [s, m] = await Promise.all([
          (await fetch("/api/settings", { headers: { Authorization: `Bearer ${localStorage.getItem("pi_server_token") || ""}` } }).then(r => r.json())),
          (await fetch("/api/models", { headers: { Authorization: `Bearer ${localStorage.getItem("pi_server_token") || ""}` } }).then(r => r.json())),
        ]);
        const settings = s as UserSettings;
        setUserSettings({ ...userSettings, ...settings });
        const groups = (m as { groups: { provider: string; models: ModelInfo[] }[] }).groups || [];
        allModelsRef.current = groups;

        const allModels = groups.flatMap(g => g.models);
        // Find default model from settings
        if (settings.model_id) {
          const [provider, ...rest] = settings.model_id.split("/");
          const modelId = rest.join("/");
          const found = allModels.find(mod => mod.provider === provider && mod.id === modelId);
          setCurrentModel(found || allModels[0]);
        } else {
          setCurrentModel(allModels[0] || null);
        }
      } catch (err) {
        console.log('Error loading defaults: ', err);
      }
    };
    loadDefaults();
  }, []);


  // Model change handler
  const handleModelSelect = useCallback(async (model: ModelInfo) => {
    setCurrentModel(model);

    if (!currentSessionId) {
      // No session active: just update local state.
      // If reasoning model, auto-set think level from user default
      if (model.reasoning) {
        const defaultLevel = userSettings.think_level || "medium";
        if (!currentThinkLevel || currentThinkLevel === "off") {
          setCurrentThinkLevel(defaultLevel);
        }
      }
      return;
    }

    // Session active: call backend to change model on the session
    try {
      const result = await changeSessionModel(currentSessionId, model.provider, model.id);
      // Update think level to match the session's new level
      setCurrentThinkLevel(result.currentLevel);
    } catch (err) {
      console.error('Failed to change model on session:', err);
    }
  }, [currentSessionId, currentThinkLevel, userSettings.think_level]);

  // Think level change handler
  const handleThinkLevelChange = useCallback(async (level: string) => {
    setCurrentThinkLevel(level);

    if (!currentSessionId) {
      // No session: just update local state
      return;
    }

    // Session active: call backend to change level on the session
    try {
      await fetch("/api/chat/thinking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("pi_server_token") || ""}`,
        },
        body: JSON.stringify({ sessionId: currentSessionId, level }),
      });
    } catch (err) {
      console.error('Failed to change think level:', err);
    }
  }, [currentSessionId]);

  return (
    <div className="chat-layout">
      <ChatSidebar
        sessions={sessions}
        sessionTotal={sessionTotal}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSessionClick={(id) => {window.location.hash = id;}}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onRenameComplete={reloadSessions}
        onLoadMore={() => loadSessions(true)}
        onShowFiles={onShowFiles}
      />
      <div className="main-area" id="mainArea">
        <ChatHeader
          username={username}
          onSettingsClick={() => setShowSettings(true)}
          onLogout={onLogout}
          currentModel={currentModel?.name || "Select a model"}
          onModelSelect={handleModelSelect}
          onThinkLevelChange={handleThinkLevelChange}
          modelInfo={currentModel}
          currentThinkLevel={currentThinkLevel}
          onSummarizeAndNew={handleSummarizeAndNew}
          summarizing={summarizing}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          sessionId={currentSessionId}
          isProcessing={isProcessing}
        />
        <ChatWindow chatState={chatState} userSettings={userSettings} setShowScrollDown={setShowScrollDown} showScrollDown={showScrollDown}/>
        <InputArea
          onSend={handleSendWrapper}
          onStop={handleStopStream}
          disabled={isProcessing}
          value={userPrompt}
          onValueChange={setUserPrompt}
          uploadedFiles={uploadedFiles}
          onAddFile={(files) => setUploadedFiles((prev) => [...prev, ...files])}
          onRemoveFile={(index) => setUploadedFiles((prev) => prev.filter((_, i) => i !== index))}
          sessionStats={chatState.sessionStats}
          showScrollDown={showScrollDown}
          setShowScrollDown={setShowScrollDown}
          sessionId={currentSessionId}
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

// Sidebar collapsed by default on narrow screens (< 800px)
function sideBarResizeListner(setSidebarCollapsed: Dispatch<SetStateAction<boolean>>): import("react").EffectCallback {
  return () => {
    const mq = window.matchMedia("(max-width: 799px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    if (mq.matches) setSidebarCollapsed(true);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  };
}
