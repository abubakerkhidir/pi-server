import { useState, useRef, useCallback } from "react";
import type { SidebarProps, Session } from "@/frontend/types";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { deleteSession, renameSession } from "@/frontend/api";

function RenameInput({
  currentName,
  sessionId,
  onSave,
  onCancel,
}: {
  currentName: string;
  sessionId: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(currentName);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className="sidebar-rename-input"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value.trim() || currentName);
          if (e.key === "Escape") onCancel();
        }}
      />
      <span className="sidebar-rename-btns">
        <button onClick={() => onSave(value.trim() || currentName)}>✓</button>
        <button onClick={onCancel}>✗</button>
      </span>
    </>
  );
}

export default function ChatSidebar({
  sessions,
  currentSessionId,
  onNewChat,
  onSessionClick,
  onLogout,
  collapsed,
  onToggle,
  onRenameComplete,
}: SidebarProps) {
  const [renameTarget, setRenameTarget] = useState<{
    sessionId: string;
    currentName: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleRename = async (sessionId: string, newName: string, onDone?: () => void) => {
    try {
      await renameSession(sessionId, newName);
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setRenameTarget(null);
    onDone?.();
  };

  const handleDelete = async (sessionId: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      try {
        await deleteSession(sessionId);
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  };

  // Close rename on document click
  const containerRef = useRef<HTMLDivElement>(null);
  const handleDocumentClick = useCallback(
    (e: MouseEvent) => {
      if (
        renameTarget &&
        !containerRef.current?.contains(e.target as Node)
      ) {
        setRenameTarget(null);
      }
    },
    [renameTarget],
  );

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`} ref={containerRef}>
      <div className="sidebar-header">
        <button className="sidebar-new" onClick={onNewChat}>
          + New chat
        </button>
        <button className="sidebar-toggle" onClick={onToggle}>
          ☰
        </button>
      </div>
      <div className="sidebar-list" id="sidebarList">
        {sessions.map((session) => {
          const isRenaming = renameTarget?.sessionId === session.id;
          const isHovered = hoveredId === session.id;
          const name = session.name || "Chat";

          return (
            <div
              key={session.id}
              className={`sidebar-item ${session.id === currentSessionId ? "active" : ""}`}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => {
                console.log("[Sidebar] Session clicked:", session.id);
                onSessionClick(session.id);
              }}
            >
              {isRenaming ? (
                <RenameInput
                  currentName={name}
                  sessionId={session.id}
                  onSave={(n) => handleRename(session.id, n, onRenameComplete)}
                  onCancel={() => setRenameTarget(null)}
                />
              ) : (
                <>
                  <span
                    className="sidebar-item-name"
                    data-id={session.id}
                  >
                    {escapeHtmlSimple(name)}
                  </span>
                  <button
                    className={`sidebar-item-edit sidebar-item-action ${isHovered ? "show" : ""}`}
                    data-id={session.id}
                    title="Rename"
                    style={{
                      display: isHovered ? "" : "none",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenameTarget({
                        sessionId: session.id,
                        currentName: name,
                      });
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className={`sidebar-item-delete sidebar-item-action ${isHovered ? "show" : ""}`}
                    data-id={session.id}
                    title="Delete"
                    style={{
                      display: isHovered ? "" : "none",
                      background: "none",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(session.id, name);
                    }}
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
