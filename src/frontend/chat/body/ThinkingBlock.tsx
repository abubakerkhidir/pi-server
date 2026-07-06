import { useState, useRef, useEffect, useCallback } from "react";
import type { ThinkingBlockProps } from "@/frontend/types";

export default function ThinkingBlock({ entity, userSettings }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(!entity.sealed);
  const maxLines = userSettings.thinking_lines || 3;
  const arrHidden = "arr-hidden";
  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded? 'block':'none'
  return (
    <div className="thinking-block">
      <div className="cb-header">
      	<span
          className={`arr-btn ${expanded ? arrHidden : ""}`}
          title="Expand"
          onClick={() => setExpanded(true)}
        >
          ▶
        </span>
        <span
          className={`arr-btn ${!expanded ? arrHidden : ""}`}
          title="Collapse"
          onClick={() => setExpanded(false)}
        >
          ▲
        </span>
        {!entity.sealed  && <span className="spinner" />}
        <span className="cb-label">Thinking</span>
      </div>
      <div className="cb-body" style={{ maxHeight: maxH, display:disVal }}>
        <div className="cb-content">{entity.content}</div>
      </div>
    </div>
  );
}
