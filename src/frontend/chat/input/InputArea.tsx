import { useEffect, useRef } from "react";
import type { InputAreaProps, SessionTokenStats } from "@/frontend/types";
import FileChips from "./FileChips";

/** Format a number: if > 1000, show in K (e.g. 1500 → "1.5K"), otherwise raw */
function fmt(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? k.toFixed(0) + "K" : k.toFixed(1) + "K";
  }
  return String(n);
}

interface InputAreaExtendedProps extends InputAreaProps {
  sessionStats?: SessionTokenStats;
  showScrollDown?:boolean, setShowScrollDown?:(a:boolean)=>void
}

export default function InputArea({
  onSend,
  onStop,
  disabled,
  value,
  onValueChange,
  uploadedFiles,
  onAddFile,
  onRemoveFile,
  sessionStats,showScrollDown,setShowScrollDown
}: InputAreaExtendedProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const lh = parseInt(getComputedStyle(textarea).lineHeight || "20");
    textarea.style.height = Math.min(textarea.scrollHeight, lh * 10) + "px";
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on plain Enter only — Shift/Ctrl/Meta+Enter insert a newline
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if ((!value.trim() && uploadedFiles.length === 0) || disabled) return;
      onSend(value.trim(), uploadedFiles);
    }
  };

  const handleSend = () => {
    console.log('send button clicked: ', disabled, value)
    if ((!value.trim() && uploadedFiles.length === 0) || disabled) return;
    onSend(value.trim(), uploadedFiles);
  };

  return (
    <div className="input-area">
      {showScrollDown && (
        <div className="scroll-down-btn-wrapper">
          <button
            className="scroll-down-btn"
            onClick={() => {
               const el = document.getElementById("chatMessages");
               if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	       setShowScrollDown?.(false)
            }}
            title="Scroll to bottom"
          >
            ↓
          </button>
        </div>
      )}
      {/* ── Session-level token stats bar ── */}
      {sessionStats && (
        <div className="session-stats-bar" title={`Context: ${sessionStats.context_percent ?? sessionStats.context_used_pct}% of ${sessionStats.context_size.toLocaleString()} tokens · TTFT avg: ${sessionStats.ttft_avg_ms}ms`}>
          <span className="session-stat">total-prompt: {fmt(sessionStats.total_prompt)}</span>
          <span className="session-stat">total-think: {fmt(sessionStats.total_think)}</span>
          <span className="session-stat">total-text: {fmt(sessionStats.total_text)}</span>
          <span className="session-stat">total-output: {fmt(sessionStats.total_output)}</span>
          <span className="session-stat">ctx: {sessionStats.context_percent != null ? Math.round(sessionStats.context_percent) : sessionStats.context_used_pct}%/{fmt(sessionStats.context_size)}</span>
          <span className="session-stat">ttft-avg: {sessionStats.ttft_avg_ms}ms</span>
        </div>
      )}
      <div className="input-wrapper">
        <div className="input-row">
          {/* File chips appear on top of the input line */}
          {uploadedFiles.length > 0 && (
            <div className="file-chips-inner">
              <FileChips files={uploadedFiles} onRemove={onRemoveFile} />
            </div>
          )}
          {/* +, textarea, send stay on the same row */}
          <div className="input-line">
            <input
              type="file"
              multiple
              accept="image/*,video/*,*/*"
              style={{ display: "none" }}
              id="file-upload"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  if (onAddFile) {
                    onAddFile(files);
                  } else {
                    onSend(value.trim(), [...uploadedFiles, ...files]);
                  }
                }
                e.target.value = "";
              }}
            />
            <button
              className="upload-btn"
              title="Upload files"
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              +
            </button>
            <textarea
              ref={textareaRef}
              className="prompt-input"
              placeholder="Tell pi what to do..."
              rows={1}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {disabled ? (
              <button
                className="stop-btn"
                title="Stop generating"
                onClick={onStop}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                className="send-btn"
                title="Send"
                onClick={handleSend}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 20, height: 20 }}>
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
