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

// ====== Ask Formatter ======
export function askFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const question = safeArgsStr(args, "question", "query");
  const text = extractTextFromResult(result);

  let bodyHtml = "";
  if (question) bodyHtml += `<div class="tool-question"><strong>Q:</strong> ${escapeHtmlSimple(question)}</div>`;
  if (text) bodyHtml += `<div class="tool-answer"><strong>A:</strong> ${escapeHtmlSimple(text)}</div>`;

  return { bodyHtml };
}

// ====== Web Search Formatter ======
export function websearchFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const query = safeArgsStr(args, "query");
  const text = extractTextFromResult(result);

  const lines = text.split("\n").length;
  const compressed = extractCompressedStats(text);
  let bodyHtml = "";
  bodyHtml += `<div class="tool-query">Search: ${escapeHtmlSimple(query || "(no query)")}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  const footerHtml = `<div class="tool-footer">${lines.toLocaleString()} lines / ${text.length.toLocaleString()} chars${compressed}</div>`;
  return { bodyHtml, footerHtml };
}

// ====== Web Fetch Formatter ======
export function webfetchFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const url = safeArgsStr(args, "url");
  const text = extractTextFromResult(result);

  const lines = text.split("\n").length;
  const compressed = extractCompressedStats(text);
  let bodyHtml = "";
  bodyHtml += `<div class="tool-url">URL: ${escapeHtmlSimple(url || "(no URL)")}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  const footerHtml = `<div class="tool-footer">${lines.toLocaleString()} lines / ${text.length.toLocaleString()} chars${compressed}</div>`;
  return { bodyHtml, footerHtml };
}

// ====== Grep Formatter ======
export function grepFormatter(result: unknown, args: Record<string, unknown> | undefined): FormatterResult {
  const pattern = safeArgsStr(args, "pattern");
  let text = typeof result === "string" ? result : "";
  if (!text && result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if ("text" in r) text = String(r.text);
    else if ("content" in r && Array.isArray(r.content)) {
      text = (r.content as unknown[]).map((c) => (c as Record<string, unknown>).text || "").join("\n");
    }
    else text = JSON.stringify(result);
  } else if (Array.isArray(result)) {
    text = (result as unknown[]).join("\n");
  }

  const matchedLines = text.split("\n").filter(Boolean);
  const matchCount = matchedLines.length;
  const compressed = extractCompressedStats(text);

  let bodyHtml = "";
  bodyHtml += `<div class="tool-pattern">Pattern: ${escapeHtmlSimple(pattern)}</div>`;
  bodyHtml += `<pre class="tool-output-text">${escapeHtmlSimple(text)}</pre>`;

  const footerHtml = `<div class="tool-footer">${matchCount.toLocaleString()} match${matchCount !== 1 ? "es" : ""}${compressed}</div>`;
  return { bodyHtml, footerHtml };
}
