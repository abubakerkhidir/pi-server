import { useEffect, useRef, useState } from "react";
import { getCommands } from "@/frontend/api";

interface Command {
  name: string;
  description: string;
  source: string;
}

interface CommandAutocompleteProps {
  value: string;
  sessionId: string | null;
  onSelect: (command: string) => void;
}

export default function CommandAutocomplete({ value, sessionId, onSelect }: CommandAutocompleteProps) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const fetchedForSession = useRef<string | null>(null);

  const isSlashMode = value.startsWith("/") && !value.includes(" ");
  const query = isSlashMode ? value.slice(1).toLowerCase() : "";
  const matches = isSlashMode ? commands.filter((c) => c.name.toLowerCase().startsWith(query)) : [];
  const clampedIdx = Math.min(activeIdx, Math.max(matches.length - 1, 0));

  // Lazily fetch commands when user starts typing a slash
  useEffect(() => {
    if (!isSlashMode) return;
    if (fetchedForSession.current === sessionId) return;
    fetchedForSession.current = sessionId;
    getCommands(sessionId).then(setCommands).catch(() => setCommands([]));
  }, [isSlashMode, sessionId]);

  // Invalidate cache on session change
  useEffect(() => {
    fetchedForSession.current = null;
  }, [sessionId]);

  // Reset active index when query changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Keyboard navigation — only active when dropdown is visible
  useEffect(() => {
    if (!isSlashMode || matches.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, matches.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Tab" || e.key === "Enter") {
        if (matches[clampedIdx]) { e.preventDefault(); onSelect("/" + matches[clampedIdx].name); }
      } else if (e.key === "Escape") {
        onSelect(value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSlashMode, matches, clampedIdx, onSelect, value]);

  if (!isSlashMode || matches.length === 0) return null;

  return (
    <ul className="cmd-autocomplete">
      {matches.map((cmd, i) => (
        <li
          key={cmd.name}
          className={`cmd-autocomplete-item${i === clampedIdx ? " active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect("/" + cmd.name); }}
        >
          <span className="cmd-name">/{cmd.name}</span>
          {cmd.description && <span className="cmd-desc">{cmd.description}</span>}
        </li>
      ))}
    </ul>
  );
}
