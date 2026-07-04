import type { FormatterResult } from "./file.js";
import { readFormatter, writeFormatter, editFormatter } from "./file.js";
import { bashFormatter, globFormatter } from "./system.js";
import { askFormatter, websearchFormatter, webfetchFormatter, grepFormatter } from "./search.js";

export type { FormatterResult } from "./file.js";

type ToolFormatter = (result: unknown, args: Record<string, unknown> | undefined) => FormatterResult;

const formatterMap: Record<string, ToolFormatter> = {
  read: readFormatter,
  ctx_read: readFormatter,
  write: writeFormatter,
  ctx_write: writeFormatter,
  edit: editFormatter,
  bash: bashFormatter,
  shell: bashFormatter,
  ctx_shell: bashFormatter,
  glob: globFormatter,
  ask: askFormatter,
  question: askFormatter,
  websearch: websearchFormatter,
  webfetch: webfetchFormatter,
  grep: grepFormatter,
  search: grepFormatter,
  ctx_search: grepFormatter,
};

export function getFormatter(toolName: string): ToolFormatter | null {
  return formatterMap[toolName] || null;
}

export function formatToolResult(toolName: string, result: unknown, args: Record<string, unknown> | undefined): FormatterResult | null {
  const fn = getFormatter(toolName);
  if (!fn) return null;
  try {
    return fn(result, args);
  } catch {
    return null;
  }
}

export { readFormatter, writeFormatter, editFormatter, bashFormatter, globFormatter, askFormatter, websearchFormatter, webfetchFormatter, grepFormatter };
