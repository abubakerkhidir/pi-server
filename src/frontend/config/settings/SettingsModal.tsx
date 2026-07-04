import { useState, useEffect } from "react";
import { getSettings, updateSettings, getTools, getModels, deleteSession, renameSession, getSessions } from "@/frontend/api";
import type { SettingsModalProps, Settings, ToolGroup, UserSettings } from "@/frontend/types";
import GeneralTab from "./SettingsTabs/GeneralTab";
import ToolsTab from "./SettingsTabs/ToolsTab";
import SessionsTab from "./SettingsTabs/SessionsTab";

export default function SettingsModal({ isOpen, onClose, onSave, onResumeSession, onSettingsChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "tools" | "sessions">("general");
  const [settings, setSettings] = useState<Settings>({ send_on_enter: true, copy_text_as_plain: true, enable_continue: true, parse_pdf_as_image: false, confirm_title_change: true, first_line_title: false, llm_title: false, system_message: "", paste_to_file_length: 0, max_image_resolution: 0, thinking_lines: 3, tool_lines: 5, home_dir: "", tools_enabled: [], model_id: "" });
  const [toolGroups, setToolGroups] = useState<ToolGroup[]>([]);
  const [sessions, setSessions] = useState<{ id: string; name: string | null; updated_at: string }[]>([]);
  const [models, setModels] = useState<{ provider: string; models: { id: string; name: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const loadData = async () => {
      try {
        const [settingsData, toolsData, sessionsData, modelsData] = await Promise.all([
          getSettings(),
          getTools(),
          (await getSessions()) as { id: string; name: string | null; updated_at: string }[],
          getModels(),
        ]);
        setSettings(settingsData as Settings);
        setToolGroups((toolsData as { groups: ToolGroup[] }).groups || []);
        setSessions(sessionsData);
        setModels((modelsData as { groups: typeof models }).groups || []);
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    loadData();
  }, [isOpen]);

  const handleChange = (field: keyof Settings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await updateSettings(settings as Record<string, unknown>);
      onSave(settings as Record<string, unknown>);
      onSettingsChange(settings as UserSettings);
    } catch { /* ignore */ }
  };

  const handleDeleteSession = async (id: string) => {
    try { await deleteSession(id); setSessions((prev) => prev.filter((s) => s.id !== id)); } catch { /* ignore */ }
  };

  const handleRenameSession = async (id: string, currentName: string): Promise<string | null> => {
    const newName = prompt("Enter new name:", currentName);
    if (!newName || newName.trim() === currentName) return null;
    try { await renameSession(id, newName.trim()); setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName.trim() } : s))); return newName.trim(); } catch { return null; }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Settings</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-tabs">
          <button className={`modal-tab ${activeTab === "general" ? "active" : ""}`} onClick={() => setActiveTab("general")}>General</button>
          <button className={`modal-tab ${activeTab === "tools" ? "active" : ""}`} onClick={() => setActiveTab("tools")}>Tools</button>
          <button className={`modal-tab ${activeTab === "sessions" ? "active" : ""}`} onClick={() => setActiveTab("sessions")}>Sessions</button>
        </div>
        <div className="modal-body">
          {loading ? <p>Loading...</p> : activeTab === "general" ? (
            <GeneralTab settings={settings} models={models} onChange={handleChange} />
          ) : activeTab === "tools" ? (
            <ToolsTab toolGroups={toolGroups} enabledTools={settings.tools_enabled || []} onChange={handleChange} />
          ) : (
            <SessionsTab sessions={sessions} onNewSession={() => { onResumeSession(null); onClose(); }} onResume={(id) => { onResumeSession(id); onClose(); }} onDelete={handleDeleteSession} onRename={handleRenameSession} />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} style={{ width: "auto" }}>Save</button>
        </div>
      </div>
    </div>
  );
}
