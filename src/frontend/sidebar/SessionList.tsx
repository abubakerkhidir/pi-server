import { useState, useRef, useCallback, useEffect } from "react";
import type { Session } from "@/frontend/types";
import { deleteSession, renameSession } from "@/frontend/api";
import SessionView from "./SessionView";
import SessionEdit from "./SessionEdit";

interface SessionListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRenameComplete?: () => void;
  onLoadMore: () => void;
  hasMore: boolean;
  total: number;
  highlightId?: string | null;
}

/**
 * Displays the session list with server-side pagination.
 * - Receives only the currently loaded sessions
 * - Shows "More" button if there are more sessions on the server
 */
export default function SessionList({
  sessions,
  currentSessionId,
  onSessionClick,
  onRenameComplete,
  onLoadMore,
  hasMore,
  total,
  highlightId,
}: SessionListProps) {
  const [renameTarget, setRenameTarget] = useState<{
    sessionId: string;
    currentName: string;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when sessions change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo(0, 0);
    }
  }, [sessions.length]);

  const handleRename = async (sessionId: string, newName: string) => {
    try {
      await renameSession(sessionId, newName);
    } catch (err) {
      console.error("Rename failed:", err);
    }
    setRenameTarget(null);
    onRenameComplete?.();
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setConfirmDeleteId(null);
    onRenameComplete?.();
  };

  // Close rename on outside click
  const containerRef = useRef<HTMLDivElement>(null);
  const handleDocumentClick = useCallback(
    (e: MouseEvent) => {
      if (renameTarget && !containerRef.current?.contains(e.target as Node)) {
        setRenameTarget(null);
      }
    },
    [renameTarget],
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick]);

  return (
    <div className="sidebar-list" id="sidebarList" ref={listRef}>
      {sessions.length === 0 && (
        <div className="sidebar-empty">No sessions yet</div>
      )}

      {sessions.map((session) => {
        const isRenaming = renameTarget?.sessionId === session.id;
        const isHovered = hoveredId === session.id;
        const isConfirming = confirmDeleteId === session.id;

        return (
          <div
            key={session.id}
            className={`sidebar-item ${session.id === currentSessionId ? "active" : ""}`}
            onMouseEnter={() => setHoveredId(session.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => {
              onSessionClick(session.id);
            }}
          >
            {isRenaming ? (
              <SessionEdit
                currentName={renameTarget.currentName}
                onSave={(n) => handleRename(session.id, n)}
                onCancel={() => setRenameTarget(null)}
              />
            ) : (
              <SessionView
                session={session}
                isActive={session.id === currentSessionId}
                isHovered={isHovered}
                isConfirmingDelete={isConfirming}
                onSessionClick={() => onSessionClick(session.id)}
                onRenameStart={() =>
                  setRenameTarget({
                    sessionId: session.id,
                    currentName: session.name || "Chat",
                  })
                }
                onDeleteStart={() => setConfirmDeleteId(session.id)}
                onDeleteConfirm={() => handleDelete(session.id)}
                onDeleteCancel={() => setConfirmDeleteId(null)}
              />
            )}
          </div>
        );
      })}

      {hasMore && (
        <button className="sidebar-more-btn" onClick={onLoadMore}>
          More ({total - sessions.length} remaining)
        </button>
      )}
    </div>
  );
}
