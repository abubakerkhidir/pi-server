export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function escapeHtmlSimple(s: string): string {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function extractText(x: unknown): string {
  if (!x) return "";
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return x.map(extractText).join("");
  if (typeof x === "object" && x !== null) {
    if ((x as Record<string, unknown>).stdout && typeof (x as Record<string, unknown>).stdout === "string") return (x as Record<string, unknown>).stdout as string;
    if ((x as Record<string, unknown>).stdout && typeof (x as Record<string, unknown>).stdout === "object") return extractText((x as Record<string, unknown>).stdout);
    if ((x as Record<string, unknown>).stderr && typeof (x as Record<string, unknown>).stderr === "string") return (x as Record<string, unknown>).stderr as string;
    if ((x as Record<string, unknown>).stderr && typeof (x as Record<string, unknown>).stderr === "object") return extractText((x as Record<string, unknown>).stderr);
    if ((x as Record<string, unknown>).content && typeof (x as Record<string, unknown>).content === "string") return (x as Record<string, unknown>).content as string;
    if ((x as Record<string, unknown>).content && typeof (x as Record<string, unknown>).content === "object") return extractText((x as Record<string, unknown>).content);
    if ((x as Record<string, unknown>).output && typeof (x as Record<string, unknown>).output === "string") return (x as Record<string, unknown>).output as string;
    if ((x as Record<string, unknown>).result && typeof (x as Record<string, unknown>).result === "string") return (x as Record<string, unknown>).result as string;
    if ((x as Record<string, unknown>).message && typeof (x as Record<string, unknown>).message === "string") return (x as Record<string, unknown>).message as string;
    try {
      return JSON.stringify(x, null, 2);
    } catch {
      return String(x);
    }
  }
  return String(x);
}

export function formatToolSummary(name: string, args: unknown): string {
  if (!args) return name;
  if (typeof args === "string") return name + "(" + args.slice(0, 97) + ")";

  let key = "";
  const a = args as Record<string, unknown>;
  if (name === "read" || name === "ctx_read" || name === "write") key = String(a.path || "");
  else if (name === "edit") key = String(a.path || "");
  else if (name === "bash" || name === "shell" || name === "ctx_shell") key = String(a.command || a.cmd || "").slice(0, 97);
  else if (name === "grep" || name === "ctx_search" || name === "ctx_semantic_search") {
    const q = String(a.pattern || a.query || "");
    key = q + (a.path ? " in " + String(a.path) : "");
  }
  else if (name === "ls" || name === "ctx_tree" || name === "ctx_glob" || name === "find") key = String(a.path || a.pattern || "");
  else key = JSON.stringify(args).slice(0, 97);

  const s = name + (key ? "(" + key + ")" : "");
  return s.length > 100 ? s.slice(0, 97) + "..." : s;
}
