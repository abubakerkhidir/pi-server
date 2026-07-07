import { useEffect, useRef } from "react";
import type { InputAreaProps, SessionTokenStats } from "@/frontend/types";

interface InputAreaExtendedProps extends InputAreaProps {
  sessionStats?: SessionTokenStats;
}

export default function InputArea({
  onSend,
  disabled,
  value,
  onValueChange,
  uploadedFiles,
  onRemoveFile,
  sessionStats,
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
      if (value.trim() && !disabled) {
        onSend(value.trim(), uploadedFiles);
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim(), uploadedFiles);
    }
  };

  return (
    <div className="input-area">
      {/* ── Session-level token stats bar ── */}
      {sessionStats && (
        <div className="session-stats-bar" title={`Context: ${sessionStats.context_used_pct}% of ${sessionStats.context_size.toLocaleString()} tokens`}>
          <span className="session-stat">total-prompt: {sessionStats.total_prompt}</span>
          <span className="session-stat">total-think: {sessionStats.total_think}</span>
          <span className="session-stat">total-output: {sessionStats.total_output}</span>
          <span className="session-stat">{sessionStats.context_used_pct}%</span>
          <span className="session-stat">{sessionStats.context_size.toLocaleString()}</span>
        </div>
      )}
      <div className="input-wrapper">
        <div className="input-row">
          <input
            type="file"
            multiple
            accept="image/*,video/*,*/*"
            style={{ display: "none" }}
            id="file-upload"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                onSend(value.trim(), [...uploadedFiles, ...files]);
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
          <button
            className="send-btn"
            disabled={disabled}
            title="Send"
            onClick={handleSend}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 20, height: 20 }}>
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
