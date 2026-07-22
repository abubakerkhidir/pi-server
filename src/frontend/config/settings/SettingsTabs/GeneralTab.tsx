import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import type { Settings } from "@/frontend/types";

interface GeneralTabProps {
  settings: Settings;
  models: { provider: string; models: { id: string; name: string }[] }[];
  onChange: (field: keyof Settings, value: unknown) => void;
}

const THINK_LEVELS = [
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Max" },
];

const Checkbox: React.FC<{ field: keyof Settings; label: string; desc: string; settings: Settings }> = ({ field, label, desc, settings }) => (
  <div className="setting-item">
    <label>
      {label}{" "}
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
    </label>
    <input
      type="checkbox"
      checked={Boolean(field === "paste_to_file_length" ? settings.paste_to_file_length : settings[field])}
      onChange={(e) => {}}
    />
  </div>
);

export default function GeneralTab({ settings, models, onChange }: GeneralTabProps) {
  const cb = (field: keyof Settings, label: string, desc: string) => (
    <div className="setting-item" key={field}>
      <label>
        {label}{" "}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
      </label>
      <input
        type="checkbox"
        checked={Boolean(field === "paste_to_file_length" ? settings.paste_to_file_length : settings[field])}
        onChange={(e) => onChange(field, e.target.checked)}
      />
    </div>
  );

  const numField = (field: keyof Settings, label: string, desc: string, fallback: number, max: number) => (
    <div className="setting-item" key={String(field)}>
      <label>
        {label}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
      </label>
      <input
        type="number"
        value={settings[field] as number ?? fallback}
        min={0}
        max={max}
        style={{ width: 60 }}
        onChange={(e) => onChange(field, parseInt(e.target.value) || fallback)}
      />
    </div>
  );

  const textField = (field: keyof Settings, label: string, desc: string, props?: { style?: React.CSSProperties }) => (
    <div className="setting-item" key={String(field)}>
      <label>
        {label}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
      </label>
      <input
        type="text"
        value={settings[field] as string || ""}
        style={{ width: 300, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, ...props?.style }}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </div>
  );

  return (
    <>
      <div className="settings-section">
        {cb("send_on_enter", "Send message on Enter", "Use Enter to send, Shift+Enter for new line.")}
        {cb("copy_text_as_plain", "Copy text attachments as plain text", "Combine attachments into plain text when copying.")}
        {cb("enable_continue", 'Enable "Continue" button', "For assistant messages, including reasoning models.")}
        {cb("parse_pdf_as_image", "Parse PDF as image", "Falls back to text for non-vision models.")}
        {cb("confirm_title_change", "Confirm title change", "Ask before changing conversation title when editing first message.")}
        {cb("first_line_title", "First non-empty line for title", "Use first non-empty line of prompt for conversation title.")}
        {cb("llm_title", "LLM-generated title", "Use LLM to auto-generate conversation titles.")}
      </div>

      <div className="settings-section">
        <h3>System Message</h3>
        <div className="setting-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <textarea rows={5} style={{ width: "100%", resize: "vertical" }} value={settings.system_message || ""} onChange={(e) => onChange("system_message", e.target.value)} />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>The starting message that defines how the model should behave.</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="setting-item" key="paste">
          <label>
            Paste long-text to file length
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— On pasting long text, it will be converted to a file. Value 0 means disable.</span>
          </label>
          <input type="number" value={settings.paste_to_file_length || 0} min={0} max={1000} style={{ width: 80 }} onChange={(e) => onChange("paste_to_file_length", parseInt(e.target.value) || 0)} />
        </div>
        {numField("max_image_resolution", "Max image resolution (megapixels)", "Images larger than this will be resized.", 0, 1000)}
        {numField("thinking_lines", "Thinking lines", "Default visible lines for reasoning blocks.", 3, 20)}
        {numField("tool_lines", "Tool lines", "Default visible lines for tool output blocks.", 5, 50)}

        <div className="setting-item" key="think_level">
          <label>
            Default Think Level
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— Default thinking level for reasoning models (used when switching models without an active session).</span>
          </label>
          <select
            style={{ maxWidth: 200, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }}
            value={settings.think_level || "medium"}
            onChange={(e) => onChange("think_level", e.target.value)}
          >
            {THINK_LEVELS.map((lvl) => (
              <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
            ))}
          </select>
        </div>

        <div className="setting-item" key="model">
          <label>
            Model
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— Default AI model to use for responses.</span>
          </label>
          <select id="model_id" style={{ maxWidth: 300, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }} value={settings.model_id||""} onChange={(e) => onChange("model_id", e.target.value)}>
            <option value="">Default</option>
            {models.map((g) => (
              <optgroup key={g.provider} label={escapeHtmlSimple(g.provider)}>
                {g.models.map((m) => (<option key={m.id} value={`${g.provider}/${m.id}`}>{m.name}</option>))}
              </optgroup>
            ))}
          </select>
        </div>

        {textField("home_dir", "Current directory", "Working directory sent to pi.")}
      </div>
    </>
  );
}
