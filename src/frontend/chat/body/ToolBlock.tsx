import { useState, useMemo } from "react";
import type { ToolBlockProps } from "@/frontend/types";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";

function getSubtitle(args: Record<string, unknown> | undefined, name: string): string {
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
}

export default function ToolBlock({ entity, userSettings }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const subtitle = getSubtitle(entity.args, entity.name);
  const maxLines = userSettings.tool_lines || 5;

  const formatted = useMemo(
    () => (entity.isComplete ? formatToolResult(entity.name, entity.result, entity.args) : null),
    [entity.name, entity.result, entity.args, entity.isComplete],
  );

  const bodyContent = useMemo(() => {
    if (entity.isComplete && formatted) {
      return formatted.bodyHtml;
    }
    const fullArgsStr = entity.args ? escapeHtmlSimple(JSON.stringify(entity.args, null, 2)) : "";
    return entity.name === "edit" && !formatted
      ? ""
      : (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") + '<div class="tool-output"></div>';
  }, [entity.args, entity.name, entity.isComplete, formatted]);

  const footerContent = useMemo(() => {
    if (entity.isComplete && formatted && formatted.footerHtml) {
      return formatted.footerHtml;
    }
    const isWrite = entity.name === "write" || entity.name === "ctx_write";
    if (isWrite && entity.args?.content) {
      const c = typeof entity.args.content === "string" ? entity.args.content : JSON.stringify(entity.args.content);
      const lines = c.split("\n").length;
      return `<div class="tool-footer">Written ${lines.toLocaleString()} lines / ${c.length.toLocaleString()} chars</div>`;
    }
    return `<div class="tool-footer">${escapeHtmlSimple(entity.name)}${subtitle ? " — " + escapeHtmlSimple(subtitle) : ""}</div>`;
  }, [entity.name, entity.args, entity.isComplete, subtitle, formatted]);

  const maxH = expanded ? "" : maxLines * 21 + "px";
  const disVal = expanded ? 'block' : 'none';

  return (
    <div className="tool-block" data-tool-id={entity.id}>
      <div className="cb-header">
        {/* Single toggle arrow */}
        <span
          className="arr-btn"
          title={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "▲" : "▶"}
        </span>
        <span className={`tool-status ${entity.isComplete ? (entity.isError ? "error" : "done") : ""}`}>
          {entity.isComplete ? (entity.isError ? "✗" : "✓") : ""}
        </span>
        {!entity.isComplete && !entity.result && <span className="spinner" />}
        <span className="cb-label">
          <span className="cb-tool-name">{entity.name}</span>
          {subtitle && <span className="cb-tool-subtitle">{subtitle}</span>}
        </span>
        {/* Duration on the far right */}
        {entity.duration != null && (
          <span className="tool-duration">{entity.duration}s</span>
        )}
      </div>
      <div className="cb-body" hidden={expanded} style={{ maxHeight: maxH, display: disVal }}>
        <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        {footerContent && <div dangerouslySetInnerHTML={{ __html: footerContent }} />}
      </div>
    </div>
  );
}
