import { useState, useRef, useEffect, useCallback } from "react";
import type { ToolBlockProps } from "@/frontend/types";
import { escapeHtmlSimple, extractText } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";

export default function ToolBlock({id,name,args,result,isError = false,maxLines = 5,isWrite = false,onToolUpdate,onToolEnd,onToolRemove,isComplete = false}: ToolBlockProps) {
  // 0 = collapsed, 1 = expanded
  const [expanded, setExpanded] = useState(isComplete && result !== undefined);
  let { bodyContent, footerContent } = extractBodyAndFooter(name, result, args, isComplete)
  const subtitle = getSubtitle(args, name);
  const arrHidden = "arr-hidden";
  const maxHight = (maxLines * 21)+'px'
  return (
    <div className="tool-block" data-tool-id={id}>
      <div className="cb-header">
        <span className={`arr-btn ${expanded ? arrHidden : ""}`} title="Expand" onClick={() => setExpanded(true)}>▶</span>
        <span className={`arr-btn ${!expanded ? arrHidden : ""}`} title="Collapse" onClick={() => setExpanded(false)}>▲</span>
        <span className={`tool-status ${isComplete ? (isError ? "error" : "done") : ""}`}>
          {isComplete ? (isError ? "✗" : "✓") : ""}
        </span>
        {!isComplete && !result && <span className="spinner" />}
        <span className="cb-label">
          <span className="cb-tool-name">{name}</span>
          {subtitle && <span className="cb-tool-subtitle">{subtitle}</span>}
        </span>
      </div>
      <div className="cb-body" hidden={expanded} style={{maxHeight:maxHight}}>
        <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
        {footerContent && (<div dangerouslySetInnerHTML={{ __html: footerContent }} />)}
      </div>
    </div>
  );
}

function extractBodyAndFooter(name: string, result: unknown, args: Record<string, unknown>, isComplete : boolean) {
  let bodyContent = "";
  let footerContent = "";
  let isWrite = name === "write"
  if ((isComplete && result !== undefined) || isWrite){
    const formatted = formatToolResult(name, result, args as Record<string, unknown>);
    if (formatted) {
      bodyContent = formatted.bodyHtml;
      if (formatted.footerHtml) footerContent = formatted.footerHtml;
    } else {
      const fullArgsStr = args ? escapeHtmlSimple(JSON.stringify(args, null, 2)) : "";
      bodyContent = name === "edit" ? "" : (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") + '<div class="tool-output"></div>';
    }
  }else{
    const fullArgsStr = args ? escapeHtmlSimple(JSON.stringify(args, null, 2)) : "";
    bodyContent = (fullArgsStr ? `<pre class="tool-params">${fullArgsStr}</pre>` : "") +'<div class="tool-output"></div>';
  }
  return { bodyContent, footerContent };
}

function getSubtitle(args: Record<string, unknown>, name: string) {
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

