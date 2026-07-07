import { useState, useEffect } from "react";
import { getSettings, updateSettings, getTools, getModels, deleteSession, renameSession, getSessions } from "@/frontend/api";
import type { SettingsModalProps, Settings, ToolGroup, UserSettings } from "@/frontend/types";
import GeneralTab from "./SettingsTabs/GeneralTab";
import ToolsTab from "./SettingsTabs/ToolsTab";

export default function SettingsModal({ isOpen, onClose, onSave, onResumeSession, onSettingsChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "tools">("general");
  const [settings, setSettings] = useState<Settings>({ send_on_enter: true, copy_text_as_plain: true, enable_continue: true, parse_pdf_as_image: false, confirm_title_change: true, first_line_title: false, llm_title: false, system_message: "", paste_to_file_length: 0, max_image_resolution: 0, thinking_lines: 3, tool_lines: 5, home_dir: "", tools_enabled: [], model_id: "" });
  const [toolGroups, setToolGroups] = useState<ToolGroup[]>([]);
  const [models, setModels] = useState<{ provider: string; models: { id: string; name: string }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const loadData = async () => {
      try {
        const [settingsData, toolsData, modelsData] = await Promise.all([
          getSettings(),
          getTools(),
          getModels(),
        ]);
        setSettings(settingsData as Settings);
        setToolGroups((toolsData as { groups: ToolGroup[] }).groups || []);
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h2>Settings</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-tabs">
          <button className={`modal-tab ${activeTab === "general" ? "active" : ""}`} onClick={() => setActiveTab("general")}>General</button>
          <button className={`modal-tab ${activeTab === "tools" ? "active" : ""}`} onClick={() => setActiveTab("tools")}>Tools</button>

        </div>
        <div className="modal-body">
          {loading ? <p>Loading...</p> : activeTab === "general" ? (
            <GeneralTab settings={settings} models={models} onChange={handleChange} />
          ) : (
            <ToolsTab toolGroups={toolGroups} enabledTools={settings.tools_enabled || []} onChange={handleChange} />
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
