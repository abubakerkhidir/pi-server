import { useState } from "react";

interface SessionEntry {
  id: string;
  name: string | null;
  updated_at: string;
}

interface SessionsTabProps {
  sessions: SessionEntry[];
  onNewSession: () => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, currentName: string) => Promise<string | null>;
}

export default function SessionsTab({ sessions: sessList, onNewSession, onResume, onDelete, onRename }: SessionsTabProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  if (sessList.length === 0) {
    return (
      <div className="settings-section">
        <h3>Sessions</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No saved sessions</p>
      </div>
    );
  }

  const handleRenameSave = async (sessionId: string, currentName: string) => {
    if (!renamingId) return;
    await onRename(sessionId, currentName);
    setRenamingId(null);
    setRenamingName("");
  };

  return (
    <div className="settings-section">
      <h3>Sessions</h3>
      <button className="btn-secondary" style={{ marginBottom: 8 }} onClick={onNewSession}>+ New Session</button>
      <div className="session-list">
        {sessList.map((s) => {
          const name = s.name || "Unnamed session";
          const isRenaming = renamingId === s.id;
          return (
            <div key={s.id} className="session-item" data-id={s.id}>
              <div className="session-info">
                {isRenaming ? (
                  <>
                    <input type="text" className="settings-rename-input" value={renamingName || name} onChange={(e) => setRenamingName(e.target.value)} maxLength={200} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleRenameSave(s.id, name); if (e.key === "Escape") setRenamingId(null); }} />
                    <span className="sidebar-rename-btns">
                      <button onClick={() => handleRenameSave(s.id, name)} title="Save">✓</button>
                      <button onClick={() => setRenamingId(null)} title="Cancel">✗</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="session-name" data-session-id={s.id}>{name}</span>
                    <span className="session-edit-btn" data-session-id={s.id} title="Rename session" style={{ cursor: "pointer", marginLeft: 4, fontSize: 12 }} onClick={() => { setRenamingId(s.id); setRenamingName(name); }}>✎</span>
                    <span className="session-date">{s.updated_at}</span>
                  </>
                )}
              </div>
              <div className="session-actions">
                <button className="resume-btn" onClick={() => onResume(s.id)}>Resume</button>
                <button className="delete-btn" onClick={() => { if (confirm(`Delete "${name}"?`)) onDelete(s.id); }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
