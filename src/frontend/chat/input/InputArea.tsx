import { useEffect, useRef } from "react";
import type { InputAreaProps } from "@/frontend/types";
import FileChips from "./FileChips";

export default function InputArea({
  onSend,
  disabled,
  value,
  onValueChange,
  uploadedFiles,
  onRemoveFile,
}: InputAreaProps) {
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
    if (e.key === "Enter" && !e.shiftKey) {
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
        <div className="input-footer">
          <FileChips files={uploadedFiles} onRemove={onRemoveFile} />
        </div>
      </div>
    </div>
  );
}
