import React, { useState, useMemo } from "react";
import type { ToolBlockProps } from "@/frontend/types";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";

function truncate(s: string, maxLen: number = 50): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

function getSubtitle(args: Record<string, unknown> | undefined, name: string): string {
  if (!args) return "";
  if (name === "write" || name === "ctx_write" || name === "read" || name === "ctx_read") {
    return truncate(String(args.path || args.filePath || args.file || ""));
  }
  if (name === "bash" || name === "shell" || name === "ctx_shell") {
    return truncate(String(args.command || args.cmd || ""));
  }
  if (name === "grep" || name === "ctx_search" || name === "ctx_semantic_search") {
    return truncate(String(args.pattern || args.query || ""));
  }
  if (name === "ls" || name === "ctx_tree" || name === "ctx_glob" || name === "find" || name === "glob") {
    return truncate(String(args.path || args.pattern || args.glob || ""));
  }
  if (name === "edit" || name === "ctx_edit") {
    return truncate(String(args.path || args.file || ""));
  }
  if (name === "websearch" || name === "web-search" || name === "web_search") {
    const ql:any = args.queries
    return truncate(String((args.query?args.query:ql && ql.length?ql[0]+(ql.length>1?' (+'+(ql.length-1)+' more)':''):'') || ""));
  }
  if (name === "webfetch" || name === "fetch_content" || name === "fetch-url" || name === "fetch") {
    return truncate(String(args.url || ""));
  }
  if (name === "ask" || name === "question") {
    return truncate(String(args.question || args.query || ""));
  }
  return "";
}

function ToolBlock({ entity, userSettings,content,sealed }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const subtitle = getSubtitle(entity.args, entity.name);
  const maxLines = userSettings.tool_lines || 5;

  const formatted = useMemo(
    () => (entity.isComplete ? formatToolResult(entity.name, entity.result, entity.args) : null),
    [entity.name, entity.result, entity.args, entity.isComplete],
  );

  const bodyContent = useMemo(() => {
    //console.log('body for:',entity,JSON.stringify(entity, null, 2))
    if (entity.isComplete && formatted) {
      return formatted.bodyHtml;
    }
    const fullArgsStr = entity.args ? escapeHtmlSimple(JSON.stringify(entity.args, null, 2)) : "";
    return entity.name === "edit" && !formatted
      ? ""
      : (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") +
          '<div class="tool-output"></div>';
  }, [entity.args, entity.name, entity.isComplete, formatted]);

  const footerContent = useMemo(() => {
    if (entity.isComplete && formatted && formatted.footerHtml) {
      return formatted.footerHtml;
    }
    const isWrite = entity.name === "write" || entity.name === "ctx_write";
    if (isWrite && entity.args?.content) {
      const c =
        typeof entity.args.content === "string"
          ? entity.args.content
          : JSON.stringify(entity.args.content);
      const lines = c.split("\n").length;
      return `<div class="tool-footer">Written ${lines.toLocaleString()} lines / ${c.length.toLocaleString()} chars</div>`;
    }
    return `<div class="tool-footer">${escapeHtmlSimple(entity.name)}${subtitle ? " — " + escapeHtmlSimple(subtitle) : ""}</div>`;
  }, [entity.name, entity.args, entity.isComplete, subtitle, formatted]);

  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded ? "block" : "none";

  const copyText = useMemo(() => {
    let s = entity.name;
    if (entity.args) s += "\n" + JSON.stringify(entity.args, null, 2);
    if (entity.result !== undefined) s += "\n" + JSON.stringify(entity.result, null, 2);
    return s;
  }, [entity.name, entity.args, entity.result]);
  console.log('render tool: ',entity.name, sealed, content)
  return (
    <div className="tool-block" data-tool-id={entity.id}>
      <div className="cb-header">
        <span
          className="arr-btn"
          title={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▲" : "▶"}
        </span>
        <span
          className={`tool-status ${entity.isComplete ? (entity.isError ? "error" : "done") : ""}`}
        >
          {entity.isComplete ? (entity.isError ? "✗" : "✓") : ""}
        </span>
        {!entity.isComplete && !entity.result && <span className="spinner" />}
        <span className="cb-label">
          <span className="cb-tool-name">{entity.name}</span>
          {subtitle && <span className="cb-tool-subtitle">{subtitle}</span>}
        </span>
        <button
          className="copy-btn header-copy"
          title="Copy content"
          onClick={() => copyToClipboard(copyText)}
        >
          <CopySvg size={12} />
        </button>
        {entity.duration != null && <span className="tool-duration">{entity.duration}s</span>}
      </div>
      <div
        className="cb-body"
        hidden={expanded}
        style={{ maxHeight: maxH, display: disVal }}
      >
        <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        {footerContent && <div dangerouslySetInnerHTML={{ __html: footerContent }} />}
      </div>
    </div>
  );
}

export default React.memo(ToolBlock)