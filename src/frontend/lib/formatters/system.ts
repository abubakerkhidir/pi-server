import { escapeHtmlSimple } from "../escapeHtml";
import type { FormatterResult } from "./file.js";

function extractCompressedStats(text: string): string {
  const match = text.match(/Compressed\s+(\d+)\s+→\s+(\d+)\s+tokens?\s+\((\d+)%\)/);
  if (!match) return "";
  const [_, from, to, pct] = match;
  return ` — Compressed ${Number(from).toLocaleString()} → ${Number(to).toLocaleString()} tokens (${pct}%)`;
}

function extractTextFromResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("text" in r) return String(r.text);
    if ("content" in r && Array.isArray(r.content)) {
      return (r.content as unknown[]).map((c) => (c as Record<string, unknown>).text || "").join("\n");
    }
    if ("stdout" in r) return String(r.stdout);
  }
  return JSON.stringify(result, null, 2);
}

function extractLines(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) return (result as unknown[]).join("\n");
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("text" in r) return String(r.text);
    if ("content" in r && Array.isArray(r.content)) {
      return (r.content as unknown[]).map((c) => (c as Record<string, unknown>).text || "").join("\n");
    }
  }
  return JSON.stringify(result);
}

function safeArgsStr(args: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!args) return "";
  for (const key of keys) {
    if (key in args) return String(args[key]);
  }
  return "";
}

// ====== Bash Formatter ======
export function bashFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const cmd = safeArgsStr(args, "command", "cmd");
  const text = extractTextFromResult(result);

  const lines = text.split("\n").length;
  const chars = text.length;

  const exitMatch = text.match(/\[exit:(\d+)\]/);
  const compressed = extractCompressedStats(text);
  let footerHtml = "";
  if (exitMatch) {
    const code = parseInt(exitMatch[1]);
    footerHtml = `<div class="tool-footer ${code !== 0 ? "tool-error" : ""}">Exit code: ${code} — ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars${compressed}</div>`;
  } else {
    footerHtml = `<div class="tool-footer">${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars${compressed}</div>`;
  }

  let bodyHtml = "";
  if (cmd) bodyHtml += `<div class="tool-cmd">$ ${escapeHtmlSimple(cmd)}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  return { bodyHtml, footerHtml };
}

// ====== Glob Formatter ======
export function globFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const pattern = safeArgsStr(args, "pattern");
  const text = extractLines(result);

  const files = text.split("\n").filter(Boolean);
  const fileCount = files.length;
  const footerHtml = `<div class="tool-footer">${fileCount.toLocaleString()} file${fileCount !== 1 ? "s" : ""} matched</div>`;

  let bodyHtml = "";
  if (pattern) bodyHtml += `<div class="tool-pattern">Pattern: ${escapeHtmlSimple(pattern)}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  return { bodyHtml, footerHtml };
}
