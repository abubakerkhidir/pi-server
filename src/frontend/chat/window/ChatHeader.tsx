import ModelSelector from "../../config/models/ModelSelector";
import type { ModelInfo, UserSettings } from "@/frontend/types";
import ThinkLevelSelector from "./ThinkLevelSelector";

interface ChatHeaderProps {
  username: string | null;
  onSettingsClick: () => void;
  onLogout: () => void;
  currentModel?: string;
  onModelSelect: (model: ModelInfo) => void;
  onThinkLevelChange: (level: string) => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  modelInfo: ModelInfo | null;
  currentThinkLevel: string | null;
  onSummarizeAndNew: () => void;
  summarizing: boolean;
  sessionId?: string | null;
  isProcessing: boolean;
  userSettings: UserSettings
}

export default function ChatHeader({
  username,onSettingsClick, onLogout, currentModel, onModelSelect, onThinkLevelChange, sidebarCollapsed, onSidebarToggle, modelInfo, currentThinkLevel, onSummarizeAndNew,
  summarizing, sessionId, isProcessing, userSettings
}: ChatHeaderProps) {
  const inputTypes = modelInfo?.input || [];
  const hasVision = inputTypes.includes("image");
  const hasReasoning = !!modelInfo?.reasoning;

  return (
    <div className="header">
      <div className="header-left">
        {sidebarCollapsed && (
          <button className="header-sidebar-toggle" onClick={onSidebarToggle} title="Open sidebar">
            ☰
          </button>
        )}
        <span className="logo">pi-server</span>
        <div className="model-select-wrapper" style={{ display: "inline-block", position: "relative" }}>
          <ModelSelector userSettings={userSettings} currentModel={currentModel} onModelSelect={onModelSelect} disabled={isProcessing}/>
        </div>
        {hasReasoning && (
          <ThinkLevelSelector sessionId={sessionId ?? null} modelId={modelInfo?.id} modelProvider={modelInfo?.provider} currentLevel={currentThinkLevel} onLevelChange={onThinkLevelChange} disabled={isProcessing}/>
        )}
        <span className="model-tags">
          {hasVision && <span className="model-tag vision">vision</span>}
          {hasReasoning && <span className="model-tag reasoning">reasoning</span>}
        </span>
      </div>
      <div className="header-right">
        <button className="icon-btn" onClick={onSummarizeAndNew} disabled={summarizing} title={summarizing ? "Summarizing current session…" : "Summarize session and start new task"}>
          {summarizing ? "⋯" : "📋"}
        </button>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{username || ""}</span>
        <button className="icon-btn" onClick={onSettingsClick} title="Settings">
          ⚙
        </button>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
