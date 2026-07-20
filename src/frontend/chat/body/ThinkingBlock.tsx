import React, { useEffect, useState } from "react";
import type { ThinkingBlockProps } from "@/frontend/types";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";

function ThinkingBlock({ id, content, sealed, duration, totalLength, userSettings }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const maxLines = userSettings.thinking_lines || 3;
  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded ? "block" : "none";
  useEffect(()=>{if(sealed)setExpanded(false)},[sealed])

  const title = duration
    ? `thinking for ${duration}s, ${(totalLength || content.length).toLocaleString()} characters`
    : `thinking, ${(totalLength || content.length).toLocaleString()} characters`;
  
  //console.log('render think: ',sealed,content.length)
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
        {!sealed && <span className="spinner" />}
        <span className="cb-label">{title}</span>
        <button
          className="copy-btn header-copy"
          title="Copy content"
          onClick={() => copyToClipboard(content)}
        >
          <CopySvg size={12} />
        </button>
        {duration != null && <span className="tool-duration">{duration}s</span>}
      </div>
      <div className="cb-body" style={{ maxHeight: maxH, display: disVal }}>
        <div className="cb-content">{content}</div>
      </div>
    </div>
  );
}

export default React.memo(ThinkingBlock)