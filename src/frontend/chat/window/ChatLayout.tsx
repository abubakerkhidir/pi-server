import { getUsername, updateSettings } from "@/frontend/api";
import type { ChatLayoutProps, ChatState, ModelInfo, Session, UserSettings } from "@/frontend/types";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { getLoadSessionHandler, getMoreSessionHndlr, getReloadSessionsHndlr, getResumeSessionHandler } from "@/frontend/chat/window/chat-utils/sessionMngmtUtils";
import { getSettingsLoaderFun } from "@/frontend/chat/window/chat-utils/settingsUtils";
import { useChatStream } from "@/frontend/hooks/useChatStream";
import { useStopStream } from "@/frontend/hooks/useStreamHandlers";
import SettingsModal from "../../config/settings/SettingsModal";
import ChatSidebar from "../../sidebar/ChatSidebar";
import InputArea from "../input/InputArea";
import { getNewChatHandler, getPageUrlHashEffect, getSummarizeAndNewHandler } from "./chat-utils/newChatUtils";
import { useHandleSend } from "./chat-utils/useSendUtils";
import ChatHeader from "./ChatHeader";
import ChatWindow from "./ChatWindow";

export default function ChatLayout({ onLogout, onShowFiles }: ChatLayoutProps) {
  //state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [userSettings, setUserSettings] = useState<UserSettings>({tools_enabled: [],thinking_lines: 3,tool_lines: 5});
  const [showSettings, setShowSettings] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 800);
  const [userPrompt, setUserPrompt] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [chatState, setChatState] = useState<ChatState>({ records: [] });
  const pendingSummaryRef = useRef<string | null>(null);
  const loadMoreOffsetRef = useRef(0);
  
  //callback functions
  const { handleSend, stopStream, resetState } = useChatStream({currentSessionId,userSettings});
  const loadSessions = useCallback(getMoreSessionHndlr(loadMoreOffsetRef, setSessions, setSessionTotal), []);
  const reloadSessions = useCallback(getReloadSessionsHndlr(loadMoreOffsetRef, loadSessions), [loadSessions]);
  const handleSendWrapper = useHandleSend({ isProcessing, setUserPrompt, setUploadedFiles, pendingSummaryRef, setChatState, setIsProcessing, handleSend, setSessions, setCurrentSessionId,currentSessionId });
  const handleNewChat = getNewChatHandler(setChatState, setCurrentSessionId, resetState, reloadSessions, setShowScrollDown)
  const handleSummarizeAndNew = useCallback(getSummarizeAndNewHandler(currentSessionId, handleNewChat, setSummarizing, pendingSummaryRef), [handleNewChat]);
  const handleResumeSession = getResumeSessionHandler(setChatState, setCurrentSessionId, resetState);
  const handleModelSelect = (model: ModelInfo) => {
    setCurrentModel(model);
    // Clear the active session so the next prompt creates a fresh session
    // with the newly selected model (the backend reads model_id from DB when creating sessions)
    setCurrentSessionId(null);
    setChatState({ records: [] });
    updateSettings({ model_id: `${model.provider}/${model.id}` }).catch(() => {});
  };
  const handleStopStream = useStopStream(stopStream, setIsProcessing);
  const loadAndShowSession = getLoadSessionHandler(currentSessionId, setChatState, setCurrentSessionId, reloadSessions);
  const username = getUsername();

  //effects
  useEffect(sideBarResizeListner(setSidebarCollapsed), []);
  useEffect(() => {loadSessions(false);}, [loadSessions]);  // Initial fetch — runs after mount, doesn't block render
  useEffect(getSettingsLoaderFun(setUserSettings, userSettings, setCurrentModel), []);
  useEffect(getPageUrlHashEffect(isProcessing, loadAndShowSession), []);

  // console.log('rndr chat: ',chatState)
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
          modelInfo={currentModel}
          onSummarizeAndNew={handleSummarizeAndNew}
          summarizing={summarizing}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          sessionId={currentSessionId}
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
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} onSave={(s) => setUserSettings({ ...userSettings, ...s })} onResumeSession={handleResumeSession} onSettingsChange={setUserSettings}/>
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

