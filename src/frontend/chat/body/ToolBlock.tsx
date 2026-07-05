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
  // 0 = collapsed, 1 = expanded
  const [expanded, setExpanded] = useState(isComplete && result !== undefined);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    if (expanded) {
      el.classList.remove("collapsed");
      el.classList.add("expanded");
      el.style.maxHeight = "";
      el.style.overflow = "";
      el.style.webkitLineClamp = "unset";
    } else {
      el.classList.remove("expanded");
      el.classList.add("collapsed");
      let lh = 21;
      const cs = getComputedStyle(el);
      const lhVal = cs.lineHeight;
      if (lhVal === "normal") {
        const fs = parseFloat(cs.fontSize);
        if (fs && !isNaN(fs)) lh = fs * 1.6;
      } else {
        const parsed = parseFloat(lhVal);
        if (parsed && !isNaN(parsed) && parsed > 0) lh = parsed;
      }
      el.style.maxHeight = (lh * maxLines) + "px";
      el.style.overflow = "hidden";
    }
  }, [expanded, maxLines]);

  const isEdit = name === "edit";

  // Extract readable subtitle from tool args
  const getSubtitle = (): string => {
    if (!args) return "";
    if (name === "write" || name === "ctx_write" || name === "read" || name === "ctx_read") {
      return String(args.path || args.filePath || args.file || "");
    }
    if (name === "bash" || name === "shell" || name === "ctx_shell") {
      return String(args.command || args.cmd || "");
    }
    if (name === "grep" || name === "ctx_search" || name === "ctx_semantic_search") {
      return String(args.pattern || args.query || "");
    }
    if (name === "ls" || name === "ctx_tree" || name === "ctx_glob" || name === "find" || name === "glob") {
      return String(args.path || args.pattern || args.glob || "");
    }
    if (name === "edit" || name === "ctx_edit") {
      return String(args.path || args.file || "");
    }
    return "";
  };

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

  const subtitle = getSubtitle();
  const arrHidden = "arr-hidden";

  return (
    <div className="tool-block" data-tool-id={id}>
      <div className="cb-header">
        <span
          className={`arr-btn ${expanded ? arrHidden : ""}`}
          title="Expand"
          onClick={() => setExpanded(true)}
        >▶</span>
        <span
          className={`arr-btn ${!expanded ? arrHidden : ""}`}
          title="Collapse"
          onClick={() => setExpanded(false)}
        >▲</span>
        <span className={`tool-status ${isComplete ? (isError ? "error" : "done") : ""}`}>
          {isComplete ? (isError ? "✗" : "✓") : ""}
        </span>
        {!isComplete && !isEdit && !result && <span className="spinner" />}
        <span className="cb-label">
          <span className="cb-tool-name">{name}</span>
          {subtitle && <span className="cb-tool-subtitle">{subtitle}</span>}
        </span>
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
