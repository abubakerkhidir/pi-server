import { escapeHtmlSimple } from "../escapeHtml";

export interface FormatterResult {
  bodyHtml: string;
  footerHtml?: string;
}

/** Extract "Compressed X → Y tokens (Z%)" from the end of tool output text */
function extractCompressedStats(text: string): string {
  const match = text.match(/Compressed\s+(\d+)\s+→\s+(\d+)\s+tokens?\s+\((\d+)%\)/);
  if (!match) return "";
  const [_, from, to, pct] = match;
  return ` — Compressed ${Number(from).toLocaleString()} → ${Number(to).toLocaleString()} tokens (${pct}%)`;
}

function safeArgsStr(args: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!args) return "";
  for (const key of keys) {
    if (key in args) return String(args[key]);
  }
  return "";
}

// ====== Read Formatter ======
export function readFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const path = safeArgsStr(args, "path", "filePath");

  let text = typeof result === "string" ? result : "";
  if (!text && result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("text" in r) text = String(r.text);
    else if ("content" in r && Array.isArray(r.content)) {
      text = (r.content as unknown[]).map((c) => (c as Record<string, unknown>).text || "").join("\n");
    }
    else if ("data" in r) text = String(r.data);
    else if (!("text" in r) && !("content" in r)) text = JSON.stringify(result, null, 2);
  }

  const lines = text.split("\n").length;
  const chars = text.length;
  const isTruncated = text.includes("[output truncated");
  const compressed = extractCompressedStats(text);
  const footerHtml = `<div class="tool-footer">Read ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars${isTruncated ? " (truncated)" : ""}${compressed}</div>`;

  let bodyHtml = "";
  if (path) bodyHtml += `<div class="tool-filepath">${escapeHtmlSimple(path)}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  return { bodyHtml, footerHtml };
}

// ====== Write Formatter ======
export function writeFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const path = safeArgsStr(args, "filePath", "path");

  let contentStr = "";
  if (args && args.content) {
    contentStr = typeof args.content === "string" ? String(args.content) : JSON.stringify(args.content);
  } else if (typeof result === "string") {
    contentStr = result;
  } else if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("content" in r) contentStr = typeof r.content === "string" ? String(r.content) : JSON.stringify(r.content);
    else if ("text" in r) contentStr = String(r.text);
    else if ("message" in r) contentStr = String(r.message);
  }
  if (!contentStr) contentStr = "(no content)";

  const lines = contentStr.split("\n").length;
  const chars = contentStr.length;
  const footerHtml = `<div class="tool-footer">Written ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars</div>`;
  // write: compressed stats come from result text, not args — skip (args.content is what was written)

  let bodyHtml = "";
  if (path) bodyHtml += `<div class="tool-filepath">${escapeHtmlSimple(path)}</div>`;

  const allLines = contentStr.split("\n");
  const previewLines = allLines.slice(0, 50);
  const isLong = allLines.length > 50;
  let displayContent = previewLines.join("\n");
  if (isLong) displayContent += `\n... (${allLines.length - 50} more lines)`;

  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(displayContent)}</pre>`;
  return { bodyHtml, footerHtml };
}

// ====== Edit Formatter ======
export function editFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const path = safeArgsStr(args, "filePath");
  const oldStr = safeArgsStr(args, "oldString");
  const newStr = safeArgsStr(args, "newString");

  let oldFromResult = "";
  let newFromResult = "";
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("oldContent" in r) oldFromResult = String(r.oldContent);
    if ("newContent" in r) newFromResult = String(r.newContent);
    if ("oldText" in r) oldFromResult = String(r.oldText);
    if ("newText" in r) newFromResult = String(r.newText);
    if ("diff" in r) {
      const diffText = typeof r.diff === "string" ? r.diff : "";
      let diffHtml = '<div class="tool-diff">';
      for (const line of diffText.split("\n")) {
        if (line.startsWith("-") && !line.startsWith("--")) {
          diffHtml += `<div class="diff-old"><span class="diff-line">${escapeHtmlSimple(line.slice(1))}</span></div>`;
        } else if (line.startsWith("+") && !line.startsWith("++")) {
          diffHtml += `<div class="diff-new"><span class="diff-line">${escapeHtmlSimple(line.slice(1))}</span></div>`;
        } else if (line.startsWith("@@")) {
          diffHtml += `<div class="diff-hunk">${escapeHtmlSimple(line)}</div>`;
        } else {
          diffHtml += `<div class="diff-ctx">${escapeHtmlSimple(line)}</div>`;
        }
      }
      diffHtml += "</div>";
      return { bodyHtml: diffHtml, footerHtml: `<div class="tool-footer">Edit diff</div>` };
    }
  }

  const effectiveOld = oldStr || oldFromResult;
  const effectiveNew = newStr || newFromResult;

  const oldLines = (Array.isArray(effectiveOld) ? (effectiveOld as string[]).join("\n") : String(effectiveOld)).split("\n");
  const newLines = (Array.isArray(effectiveNew) ? (effectiveNew as string[]).join("\n") : String(effectiveNew)).split("\n");

  let bodyHtml = "";
  if (path) bodyHtml += `<div class="tool-filepath">${escapeHtmlSimple(path)}</div>`;

  const hasOld = oldLines.length > 0 && oldLines[0] !== "";
  const hasNew = newLines.length > 0 && newLines[0] !== "";

  if (hasOld || hasNew) {
    bodyHtml += '<div class="tool-diff">';
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (i < oldLines.length && oldLines[i] !== "") {
        bodyHtml += `<div class="diff-old"><span class="diff-line">${escapeHtmlSimple(oldLines[i])}</span></div>`;
      }
      if (i < newLines.length && newLines[i] !== "") {
        bodyHtml += `<div class="diff-new"><span class="diff-line">${escapeHtmlSimple(newLines[i])}</span></div>`;
      }
    }
    bodyHtml += "</div>";
  } else {
    let text = typeof result === "string" ? result : "";
    if (!text && result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if ("text" in r) text = String(r.text);
      else if ("content" in r && Array.isArray(r.content)) {
        text = (r.content as unknown[]).map((c) => (c as Record<string, unknown>).text || "").join("\n");
      }
      else if (!("oldContent" in r) && !("newContent" in r)) text = JSON.stringify(result, null, 2);
    }
    if (text) bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;
  }

  const oldCount = (Array.isArray(effectiveOld) ? (effectiveOld as string[]).length : String(effectiveOld).split("\n").filter((l) => l !== "").length);
  const newCount = (Array.isArray(effectiveNew) ? (effectiveNew as string[]).length : String(effectiveNew).split("\n").filter((l) => l !== "").length);
  // Get compressed stats from result text (edit result may contain it)
  let resultText = "";
  if (typeof result === "string") resultText = result;
  else if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    resultText = ("text" in r ? String(r.text) : ("content" in r ? String(r.content) : ""));
  }
  const compressed = extractCompressedStats(resultText);
  const footerHtml = `<div class="tool-footer">Edit: ${oldCount} old → ${newCount} new lines${compressed}</div>`;

  return { bodyHtml, footerHtml };
}
