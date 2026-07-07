import { useState } from "react";
import type { ThinkingBlockProps } from "@/frontend/types";

export default function ThinkingBlock({ entity, userSettings }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(!entity.sealed);
  const maxLines = userSettings.thinking_lines || 3;
  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded ? 'block' : 'none';

  const title = entity.duration
    ? `thinking for ${entity.duration}s, ${(entity.totalLength || entity.content.length).toLocaleString()} characters`
    : `thinking, ${(entity.totalLength || entity.content.length).toLocaleString()} characters`;

  return (
    <div className="thinking-block">
      <div className="cb-header">
        {/* Single toggle arrow — replaces itself, no extra space */}
        <span
          className="arr-btn"
          title={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▲" : "▶"}
        </span>
        {!entity.sealed && <span className="spinner" />}
        <span className="cb-label">{title}</span>
      </div>
      <div className="cb-body" style={{ maxHeight: maxH, display: disVal }}>
        <div className="cb-content">{entity.content}</div>
      </div>
    </div>
  );
}
