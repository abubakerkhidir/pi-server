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

  // Lazily fetch commands when user starts typing a slash
  const isSlashMode = value.startsWith("/") && !value.includes(" ");

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

  if (!isSlashMode || commands.length === 0) return null;

  const query = value.slice(1).toLowerCase();
  const matches = commands.filter((c) => c.name.toLowerCase().startsWith(query));
  if (matches.length === 0) return null;

  const clampedIdx = Math.min(activeIdx, matches.length - 1);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Tab" || e.key === "Enter") {
      if (matches[clampedIdx]) { e.preventDefault(); onSelect("/" + matches[clampedIdx].name); }
    } else if (e.key === "Escape") { onSelect(value); /* keep current, close */ }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => { setActiveIdx(0); }, [query]);

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
