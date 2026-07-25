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

export default function GeneralTab({ settings, models, onChange }: GeneralTabProps) {
  const cb = cpFun(settings, onChange);
  const numField = numFieldFun(settings, onChange);
  const textField = textFieldFun(settings, onChange);
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
        {numField("paste_to_file_length", "Paste long-text to file length", "— On pasting long text, it will be converted to a file. Value 0 means disable.", 0, 1000)}
        {numField("max_image_resolution", "Max image resolution (megapixels)", "Images larger than this will be resized.", 0, 1000)}
        {numField("thinking_lines", "Thinking lines", "Default visible lines for reasoning blocks.", 3, 20)}
        {numField("tool_lines", "Tool lines", "Default visible lines for tool output blocks.", 5, 50)}
        {selectField("think_level",'Default Think Level',onChange,settings.model_id||"",'— Default thinking level for reasoning models (used when switching models without an active session).',THINK_LEVELS)}
        {selectField("model_id",'Model',onChange,settings.model_id||"",'— Default AI model to use for responses.',undefined,
          models.map(g=>{return {group:g.provider,values:g.models.map(m=>{return {value:`${g.provider}/${m.id}`,label:m.name}})}}))}
        {numField("sampling_temperature", "Sampling Temperature", "- How deterministic or creative the agent should be in response, range 0-2  (0: deterministic, 2: creative)", 0, 2,true)}
        {numField("sampling_top_p", "Sampling Top-P", "- % at which tokens should be selected, 0.9 means select samples with accumlative% > 90%.", 0.9, 1,true)}
        {numField("sampling_top_k", "Sampling Top-K", "- number of tokens to be considered for sampling (after sorting), if 100 tokens are in the candidate list, and u set top-k to 20, the llm will only consider the top-20 tokens (after sorting by probability desc)", -1, 1000)}
        {textField("home_dir", "Current directory", "Working directory sent to pi.")}
      </div>
    </>
  );
}

type Option = {value: string;label: string;};
type SelectVal = string | readonly string[] | number | undefined
type OnChangePrms = (field: keyof Settings, value: unknown) => void;

function cpFun(settings: Settings, onChange: (field: keyof Settings, value: unknown) => void) {
  return (field: keyof Settings, label: string, desc: string) => (
    <div className="setting-item" key={field}>
      <label>
        {label}{" "}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
      </label>
      <input
        type="checkbox"
        checked={Boolean(field === "paste_to_file_length" ? settings.paste_to_file_length : settings[field])}
        onChange={(e) => onChange(field, e.target.checked)} />
    </div>
  );
}

function textFieldFun(settings: Settings, onChange: (field: keyof Settings, value: unknown) => void) {
  return (field: keyof Settings, label: string, desc: string, props?: { style?: React.CSSProperties; }) => (
    <div className="setting-item" key={String(field)}>
      <label>
        {label}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {desc}</span>
      </label>
      <input
        type="text"
        value={settings[field] as string || ""}
        style={{ width: 300, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, ...props?.style }}
        onChange={(e) => onChange(field, e.target.value)} />
    </div>
  );
}

function numFieldFun(settings: Settings, onChange: (field: keyof Settings, value: unknown) => void) {
  return (field: keyof Settings, label: string, desc: string, fallback: number, max: number, decimal?:boolean) => (
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
        step={decimal?'any':undefined}
        onChange={(e) => onChange(field, parseInt(e.target.value) || fallback)} />
    </div>
  );
}

function selectField(field: keyof Settings, title:string,onChange:OnChangePrms,val?:SelectVal,desc?:string,options?:Option[],groupedOptions?:{group:string,values:Option[]}[])
{
  if(!options?.length && !groupedOptions?.length) return <></>
  return <div className="setting-item" key={field}>
    <label>
        {title}
        {desc && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{desc}</span>}
    </label>
    <select
      style={{ maxWidth: 200, padding: "6px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13 }}
      value={val} onChange={(e) => onChange(field, e.target.value)}
    >
      {options?.map((lvl) => (
        <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
      ))}
      {groupedOptions?.map((g) => (
        <optgroup key={g.group} label={escapeHtmlSimple(g.group)}>
          {g.values.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
        </optgroup>
      ))}
    </select>
  </div>
}