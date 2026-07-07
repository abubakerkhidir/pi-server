import ModelSelector from "../../config/models/ModelSelector";

interface ChatHeaderProps {
  username: string | null;
  onSettingsClick: () => void;
  onLogout: () => void;
  currentModel: string;
  onModelSelect: (model: { name: string }) => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

export default function ChatHeader({
  username,
  onSettingsClick,
  onLogout,
  currentModel,
  onModelSelect,
  sidebarCollapsed,
  onSidebarToggle,
}: ChatHeaderProps) {
  return (
    <div className="header">
      <div className="header-left">
        {sidebarCollapsed && (
          <button className="header-sidebar-toggle" onClick={onSidebarToggle} title="Open sidebar">
            ☰
          </button>
        )}
        <span className="logo">pi-server</span>
        <span className="model-badge">Coding Agent</span>
        <span className="model-tags" id="modelTags" />
      </div>
      <div className="header-right">
        <ModelSelector currentModel={currentModel} onModelSelect={onModelSelect} />
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
