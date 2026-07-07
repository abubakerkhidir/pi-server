import { useState, useCallback, useRef } from "react";
import type { Session } from "@/frontend/types";
import SearchBox from "./SearchBox";
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
 * Sidebar container — renders header + toggle + search box + delegates list rendering
 * and interaction state to <SessionList />.
 * When search is active, search results replace the normal session list.
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

  // ── Search state ──
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const isSearchActive = searchResults !== null;

  const handleSearchResults = useCallback(
    (results: Session[] | null, query: string) => {
      setSearchResults(results);
      setSearchQuery(query);
    },
    [],
  );

  const cancelSearch = useCallback(() => {
    setSearchResults(null);
    setSearchQuery("");
  }, []);

  const displaySessions = isSearchActive ? (searchResults ?? []) : sessions;
  const displayTotal = isSearchActive ? (searchResults?.length ?? 0) : sessionTotal;

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

      {/* ── Search box ── */}
      <SearchBox onSearchResults={handleSearchResults} />

      {/* ── Search results header / cancel ── */}
      {isSearchActive && (
        <div className="sidebar-search-header">
          <span className="sidebar-search-count">
            {searchResults?.length ?? 0} result{searchResults?.length !== 1 ? "s" : ""}
          </span>
          <button
            className="sidebar-search-cancel"
            onClick={cancelSearch}
            title="Clear search results"
          >
            ✕
          </button>
        </div>
      )}

      <SessionList
        sessions={displaySessions}
        currentSessionId={currentSessionId}
        onSessionClick={onSessionClick}
        onRenameComplete={onRenameComplete}
        onLoadMore={onLoadMore}
        hasMore={!isSearchActive && sessions.length < sessionTotal}
        total={displayTotal}
      />
    </div>
  );
}
