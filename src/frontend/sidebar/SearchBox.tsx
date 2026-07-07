import { useState, useCallback, useEffect, useRef } from "react";
import type { Session } from "@/frontend/types";
import { searchSessions } from "@/frontend/api";

interface SearchBoxProps {
  onSearchResults: (results: Session[] | null, query: string) => void;
}

/**
 * Search box for the sidebar — queries the backend search endpoint
 * with debounce and reports results via callback.
 */
export default function SearchBox({ onSearchResults }: SearchBoxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        onSearchResults(null, "");
        return;
      }
      setSearching(true);
      try {
        const result = await searchSessions(q.trim());
        const data = result as { sessions: Session[]; total: number };
        onSearchResults(data.sessions, q);
      } catch {
        onSearchResults([], q);
      } finally {
        setSearching(false);
      }
    },
    [onSearchResults],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchQuery(val);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (!val.trim()) {
        onSearchResults(null, "");
        return;
      }

      searchTimeoutRef.current = setTimeout(() => {
        doSearch(val);
      }, 300);
    },
    [doSearch, onSearchResults],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
        doSearch(searchQuery);
      }
      if (e.key === "Escape") {
        setSearchQuery("");
        onSearchResults(null, "");
        setSearching(false);
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
      }
    },
    [searchQuery, doSearch, onSearchResults],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="sidebar-search">
      <input
        type="text"
        className="sidebar-search-input"
        placeholder="Search chat history…"
        value={searchQuery}
        onChange={handleSearchChange}
        onKeyDown={handleSearchKeyDown}
      />
      {searching && <span className="sidebar-search-spinner" />}
    </div>
  );
}
