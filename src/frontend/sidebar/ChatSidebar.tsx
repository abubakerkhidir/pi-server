import { useRef } from "react";
import type { Session } from "@/frontend/types";
import SessionList from "./SessionList";

interface SidebarProps {
  sessions: Session[];
  sessionTotal: number;
  currentSessionId: string | null;
  onNewChat: () => void;
  onSessionClick: (sessionId: string) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggle: () => void;
  onRenameComplete?: () => void;
  onLoadMore: () => void;
}

/**
 * Sidebar container — renders header + toggle + delegates list rendering
 * and interaction state to <SessionList />.
 */
export default function ChatSidebar({
  sessions,
  sessionTotal,
  currentSessionId,
  onNewChat,
  onSessionClick,
  collapsed,
  onToggle,
  onRenameComplete,
  onLoadMore,
}: SidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`} ref={containerRef}>
      <div className="sidebar-header">
        <button className="sidebar-new" onClick={onNewChat}>
          + New chat
        </button>
        <button className="sidebar-toggle" onClick={onToggle} title="Close sidebar">
          ◀
        </button>
      </div>
      <SessionList
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSessionClick={onSessionClick}
        onRenameComplete={onRenameComplete}
        onLoadMore={onLoadMore}
        hasMore={sessions.length < sessionTotal}
        total={sessionTotal}
      />
    </div>
  );
}
