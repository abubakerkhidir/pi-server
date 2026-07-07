import { useState } from "react";
import type { ThinkingBlockProps } from "@/frontend/types";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";

export default function ThinkingBlock({ entity, userSettings }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(!entity.sealed);
  const maxLines = userSettings.thinking_lines || 3;
  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded ? "block" : "none";

  const title = entity.duration
    ? `thinking for ${entity.duration}s, ${(entity.totalLength || entity.content.length).toLocaleString()} characters`
    : `thinking, ${(entity.totalLength || entity.content.length).toLocaleString()} characters`;

  return (
    <div className="thinking-block">
      <div className="cb-header">
        <span
          className="arr-btn"
          title={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▲" : "▶"}
        </span>
        {!entity.sealed && <span className="spinner" />}
        <span className="cb-label">{title}</span>
        <button
          className="copy-btn header-copy"
          title="Copy content"
          onClick={() => copyToClipboard(entity.content)}
        >
          <CopySvg size={12} />
        </button>
        {entity.duration != null && <span className="tool-duration">{entity.duration}s</span>}
      </div>
      <div className="cb-body" style={{ maxHeight: maxH, display: disVal }}>
        <div className="cb-content">{entity.content}</div>
      </div>
    </div>
  );
}
