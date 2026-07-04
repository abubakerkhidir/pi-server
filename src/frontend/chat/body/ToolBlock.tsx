import { useState, useRef, useEffect, useCallback } from "react";
import type { ToolBlockProps } from "@/frontend/types";
import { escapeHtmlSimple, extractText } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";

export default function ToolBlock({
  id,
  name,
  args,
  result,
  isError = false,
  maxLines = 5,
  isWrite = false,
  onToolUpdate,
  onToolEnd,
  onToolRemove,
  isComplete = false,
}: ToolBlockProps) {
  const [state, setState] = useState<0 | 1 | 2>(isComplete ? 2 : 1);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Update elapsed time for write operations
  useEffect(() => {
    if (!isWrite) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isWrite]);

  // Collapsible logic
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
      let lh = 21;
      const cs = getComputedStyle(el);
      const lhVal = cs.lineHeight;
      if (lhVal === "normal") {
        const fs = parseFloat(cs.fontSize);
        if (fs && !isNaN(fs)) lh = fs * 1.5;
      } else {
        const parsed = parseFloat(lhVal);
        if (parsed && !isNaN(parsed) && parsed > 0) lh = parsed;
      }
      el.style.maxHeight = (lh * maxLines) + "px";
      el.style.overflow = "hidden";
      el.style.display = "";
      el.style.webkitLineClamp = String(maxLines);
      el.classList.add("collapsed");
    } else {
      el.style.maxHeight = "";
      el.style.overflow = "";
      el.style.display = "";
      el.style.webkitLineClamp = "unset";
      el.classList.remove("collapsed");
    }
  }, [state, maxLines]);

  // Auto-collapse if no result on complete
  useEffect(() => {
    if (isComplete && result !== undefined && name === "edit") {
      // Edit tools get their result from onToolEnd
    }
  }, [isComplete, result, name]);

  const getArgsSummary = () => {
    const str = args ? JSON.stringify(args) : "";
    return name + (str ? "(" + str.slice(0, 97) + ")" : "");
  };

  const isEdit = name === "edit";

  // Build the formatted output
  let bodyContent = "";
  let footerContent = "";

  if (isWrite && args && args.content) {
    const content = typeof args.content === "string" ? args.content : JSON.stringify(args.content);
    const lines = content.split("\n").length;
    const chars = content.length;
    if (isComplete) {
      footerContent = `<div class="tool-footer">Written ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars</div>`;
    } else {
      footerContent = `<div class="tool-footer">Writing — ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars (${elapsed}s)</div>`;
    }
  }

  // Apply formatter when complete
  if (isComplete && result !== undefined) {
    const formatted = formatToolResult(name, result, args as Record<string, unknown>);
    if (formatted) {
      bodyContent = formatted.bodyHtml;
      if (formatted.footerHtml) footerContent = formatted.footerHtml;
      // Auto-expand on format
      if (formatted.bodyHtml.includes("tool-diff") || formatted.bodyHtml.includes("tool-output-text")) {
        useEffect(() => setState(2), []);
      }
    } else {
      const fullArgsStr = args ? escapeHtmlSimple(JSON.stringify(args, null, 2)) : "";
      bodyContent = isEdit
        ? ""
        : (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") +
          '<div class="tool-output"></div>';
    }
  } else if (!isEdit) {
    const fullArgsStr = args ? escapeHtmlSimple(JSON.stringify(args, null, 2)) : "";
    bodyContent = (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") +
      '<div class="tool-output"></div>';
  }

  const arrHidden = "arr-hidden";

  return (
    <div className="tool-block" data-tool-id={id}>
      <div className="cb-header">
        <span
          className={`arr-btn ${state === 0 ? "" : arrHidden}`}
          title="Expand"
          onClick={() => setState(1)}
        />
        <span
          className={`arr-btn ${state === 1 ? "" : arrHidden}`}
          title="Expand fully"
          onClick={() => setState(2)}
        />
        <span
          className={`arr-btn ${state === 2 ? "" : arrHidden}`}
          title="Collapse"
          onClick={() => (state === 2 ? setState(1) : setState(0))}
        />
        <span className={`tool-status ${isComplete ? (isError ? "error" : "done") : ""}`}>
          {isComplete ? (isError ? "✗" : "✓") : ""}
        </span>
        {!isComplete && !isEdit && !result && <span className="spinner" />}
        <span className="cb-label">{escapeHtmlSimple(getArgsSummary())}</span>
      </div>
      <div className="cb-body" ref={bodyRef}>
        <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        {/* Write tool footer — computed from args content (live during streaming, static when complete) */}
        {isWrite && isComplete && (() => {
          const content = (args as Record<string, unknown>)?.content as string;
          const lines = content?.split?.("\n")?.length || 0;
          const chars = content?.length || 0;
          return <div className="tool-footer" data-lines={lines} data-chars={chars}>Written {lines} lines / {chars} chars</div>;
        })()}
        {isWrite && !isComplete && (() => {
          const content = (args as Record<string, unknown>)?.content as string;
          const lines = content?.split?.("\n")?.length || 0;
          const chars = content?.length || 0;
          return <div className="tool-footer">Writing — {lines} lines / {chars} chars ({elapsed}s)</div>;
        })()}
        {/* Footer from formatter (read/edit/grep etc.) — only for non-write tools */}
        {footerContent && !isWrite && (
          <div dangerouslySetInnerHTML={{ __html: footerContent }} />
        )}
      </div>
    </div>
  );
}
