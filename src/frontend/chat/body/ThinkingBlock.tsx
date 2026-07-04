import { useState, useRef, useEffect, useCallback } from "react";
import type { ThinkingBlockProps } from "@/frontend/types";

export default function ThinkingBlock({
  content,
  isStreaming = false,
  maxLines = 3,
}: ThinkingBlockProps) {
  const [state, setState] = useState<0 | 1 | 2>(isStreaming ? 1 : 0); // 0=hidden, 1=partial, 2=full
  const bodyRef = useRef<HTMLDivElement>(null);

  const lineHeight = useCallback((els: Element[]) => {
    for (const el of els) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      const lhVal = cs.lineHeight;
      if (lhVal === "normal") {
        const fs = parseFloat(cs.fontSize);
        if (fs && !isNaN(fs) && fs > 0) return fs * 1.5;
      }
      const lh = parseFloat(lhVal);
      if (lh && !isNaN(lh) && lh > 0) return lh;
    }
    return 21;
  }, []);

  useEffect(() => {
    if (!bodyRef.current) return;
    const el = bodyRef.current;

    if (state === 0) {
      el.style.maxHeight = "0px";
      el.style.overflow = "hidden";
      el.style.display = "none";
      el.style.webkitLineClamp = "0";
      el.classList.add("collapsed");
    } else if (state === 1) {
      const lh = lineHeight([el, el.parentElement || document.body]);
      el.style.maxHeight = (lh * (maxLines || 3)) + "px";
      el.style.overflow = "hidden";
      el.style.display = "";
      el.style.webkitLineClamp = String(maxLines || 3);
      el.classList.add("collapsed");
    } else {
      el.style.maxHeight = "";
      el.style.overflow = "";
      el.style.display = "";
      el.style.webkitLineClamp = "unset";
      el.classList.remove("collapsed");
    }
  }, [state, maxLines, lineHeight]);

  const arrHidden = "arr-hidden";

  return (
    <div className="thinking-block">
      <div className="cb-header">
        <span
          className={`arr-btn ${state === 0 ? "" : arrHidden}`}
          title="Expand"
          onClick={() => setState(1)}
        >
          ▶
        </span>
        <span
          className={`arr-btn ${state === 1 ? "" : arrHidden}`}
          title="Expand fully"
          onClick={() => setState(2)}
        >
          ▼
        </span>
        <span
          className={`arr-btn ${state === 2 ? "" : arrHidden}`}
          title="Collapse"
          onClick={() => (state === 2 ? setState(1) : setState(0))}
        >
          ▲
        </span>
        {isStreaming && <span className="spinner" />}
        <span className="cb-label">Thinking</span>
      </div>
      <div className="cb-body" ref={bodyRef}>
        <div className="cb-content">{content}</div>
      </div>
    </div>
  );
}
