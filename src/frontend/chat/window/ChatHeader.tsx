import ModelSelector from "../../config/models/ModelSelector";
import type { ModelInfo } from "@/frontend/types";
import ThinkLevelSelector from "./ThinkLevelSelector";

interface ChatHeaderProps {
  username: string | null;
  onSettingsClick: () => void;
  onLogout: () => void;
  currentModel: string;
  onModelSelect: (model: ModelInfo) => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  modelInfo: ModelInfo | null;
  onSummarizeAndNew: () => void;
  summarizing: boolean;
  sessionId?: string | null;
}

export default function ChatHeader({
  username,
  onSettingsClick,
  onLogout,
  currentModel,
  onModelSelect,
  sidebarCollapsed,
  onSidebarToggle,
  modelInfo,
  onSummarizeAndNew,
  summarizing,
  sessionId,
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
        <ModelSelector currentModel={currentModel} onModelSelect={onModelSelect} />
        {hasReasoning && (
          <ThinkLevelSelector sessionId={sessionId ?? null} modelId={modelInfo?.id ?? null} modelProvider={modelInfo?.provider ?? null} />
        )}
        <span className="model-tags">
          {hasVision && <span className="model-tag vision">vision</span>}
          {hasReasoning && <span className="model-tag reasoning">reasoning</span>}
        </span>
      </div>
      <div className="header-right">
        <button
          className="icon-btn"
          onClick={onSummarizeAndNew}
          disabled={summarizing}
          title={summarizing ? "Summarizing current session…" : "Summarize session and start new task"}
        >
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
