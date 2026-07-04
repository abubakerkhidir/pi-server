import { getChatHistory } from "@/frontend/api";
import type { RefObject } from "react";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

function setupToggleDelegation(chatRef: RefObject<HTMLDivElement | null>) {
  const handleToggleClick = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement)?.closest(".arr-btn");
    if (!btn) return;
    const header = btn.closest(".cb-header");
    if (!header) return;
    const body = header.parentElement?.querySelector(".cb-body") as HTMLDivElement;
    if (!body) return;
    const isExpanded = body.style.display !== "none" && !body.classList.contains("collapsed");
    const expandBtn = header.querySelector(".arr-expand") as HTMLElement;
    const downBtn = header.querySelector(".arr-down") as HTMLElement;
    const upBtn = header.querySelector(".arr-up") as HTMLElement;
    if (isExpanded) {
      body.style.display = "none";
      body.classList.add("collapsed");
      if (expandBtn) expandBtn.classList.remove("arr-hidden");
      if (downBtn) downBtn.classList.add("arr-hidden");
      if (upBtn) upBtn.classList.add("arr-hidden");
    } else {
      body.style.display = "";
      body.classList.remove("collapsed");
      body.style.maxHeight = "";
      body.style.overflow = "";
      body.style.webkitLineClamp = "unset";
      if (expandBtn) expandBtn.classList.add("arr-hidden");
      if (downBtn) downBtn.classList.remove("arr-hidden");
      if (upBtn) upBtn.classList.remove("arr-hidden");
    }
    e.preventDefault();
  };
  chatRef.current?.addEventListener("click", handleToggleClick);
}

export async function loadSessionHistory(
  sessionId: string,
  currentSessionId: string | null,
  chatRef: RefObject<HTMLDivElement | null>,
  welcomeRef: RefObject<HTMLDivElement | null>,
  setCurrentSessionId: (id: string | null) => void,
  loadSessions: () => Promise<void>,
) {
  console.log("[SessionHistory] loadSessionHistory called:", { sessionId, currentSessionId, currentSessionIdRef: currentSessionId });
  if (sessionId === currentSessionId) { console.log("[SessionHistory] Already on this session, skipping"); return; }
  try {
    const history = await getChatHistory(sessionId);
    setCurrentSessionId(sessionId);
    chatRef.current?.querySelectorAll(".message")?.forEach((m) => m.remove());
    const welcome = welcomeRef.current;
    if (welcome) welcome.style.display = "none";

    const h = history as { messages: { role: string; content: string }[]; tools: { id: string; name: string; args: string; result: string; is_error?: boolean }[]; thinking: { content: string }[] };
    const toolMap: Record<string, typeof h.tools> = {};
    h.tools?.forEach((t) => { if (!toolMap[t.id]) toolMap[t.id] = []; toolMap[t.id].push(t); });

    const allThinking = (h.thinking || []).map((t) => t.content).join("\n");
    let thinkingAttached = false;

    // Set up toggle delegation after messages are created
    setTimeout(() => setupToggleDelegation(chatRef), 0);

    for (const msg of h.messages) {
      if (msg.role === "user") {
        const el = document.createElement("div");
        el.className = "message user";
        el.innerHTML = `<div class="message-header">You</div><div class="message-content"><p>${escapeHtmlSimple(msg.content)}</p></div>`;
        chatRef.current?.appendChild(el);
      } else if (msg.role === "assistant") {
        const el = document.createElement("div");
        el.className = "message assistant";
        el.innerHTML = `<div class="message-header">PI</div><div class="message-content"><div class="message-flow"></div></div>`;
        const flow = el.querySelector(".message-flow") as HTMLDivElement;

        if (allThinking && !thinkingAttached) {
          const tb = document.createElement("div");
          tb.className = "thinking-block";
          tb.innerHTML = `<div class="cb-header"><span class="arr-btn arr-expand" title="Expand">▶</span><span class="arr-btn arr-down arr-hidden" title="Expand fully">▼</span><span class="arr-btn arr-up arr-hidden" title="Collapse">▲</span><span class="cb-label">Thinking</span></div><div class="cb-body" style="display:none;"><div class="cb-content"></div></div>`;
          (tb.querySelector(".cb-content") as HTMLDivElement).textContent = allThinking;
          flow.appendChild(tb); thinkingAttached = true;
        }

        for (const [, entries] of Object.entries(toolMap)) {
          const first = entries[0];
          if (!first) continue;
          const lastEntry = entries[entries.length - 1];
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(first.args || "{}"); } catch { /* ignore */ }
          let result: unknown = null;
          try { result = JSON.parse(lastEntry.result || "null"); } catch { /* ignore */ }

          const formatted = formatToolResult(first.name, result, args);
          const body = formatted ? formatted.bodyHtml : `<pre class="tool-params">${escapeHtmlSimple(JSON.stringify(args, null, 2))}</pre><div class="tool-output"></div>`;

          const toolLabel = (first.name as string).toLowerCase().replace(/_/g, " ");
          const detailKeys = ["write", "read", "ctx_read", "ctx_write", "edit", "ctx_edit"];
          const cmdKeys = ["bash", "shell", "ctx_shell"];
          const searchKeys = ["grep", "ctx_search", "ctx_semantic_search"];
          const globKeys = ["ls", "ctx_tree", "ctx_glob", "find", "glob"];
          let detail = "";
          if (detailKeys.includes(first.name)) detail = ((args.path || args.file) as string) || "";
          else if (cmdKeys.includes(first.name)) detail = ((args.command || args.cmd) as string) || "";
          else if (searchKeys.includes(first.name)) detail = ((args.pattern || args.query) as string) || "";
          else if (globKeys.includes(first.name)) detail = ((args.path || args.pattern || args.glob) as string) || "";

          const titleHtml = detail
            ? `<span style="font-weight:bold;text-transform:lowercase;">${escapeHtmlSimple(toolLabel)}</span><span style="font-size:0.9em;color:var(--text-muted);margin-left:4px;">${escapeHtmlSimple(detail)}</span>`
            : `<span style="font-weight:bold;text-transform:lowercase;">${escapeHtmlSimple(toolLabel)}</span>`;

          const tb = document.createElement("div");
          tb.className = "tool-block";
          tb.innerHTML = `<div class="cb-header" style="background:var(--surface3);"><span class="arr-btn arr-expand" title="Expand">▶</span><span class="arr-btn arr-down arr-hidden" title="Expand fully">▼</span><span class="arr-btn arr-up arr-hidden" title="Collapse">▲</span><span class="tool-status ${first.is_error ? "error" : "done"}">${first.is_error ? "✗" : "✓"}</span><span class="cb-label">${titleHtml}</span></div><div class="cb-body collapsed" style="display:none;">${body}</div>`;
          flow.appendChild(tb);
        }

        if (msg.content && msg.content !== "(no text response)") {
          const md = document.createElement("div");
          md.className = "markdown";
          const parsed = marked.parse(msg.content);
          md.innerHTML = Array.isArray(parsed) ? parsed.join("") : (parsed as string);
          flow.appendChild(md);
        }
        chatRef.current?.appendChild(el);
      }
    }

    chatRef.current?.scrollTo({ top: chatRef.current!.scrollHeight });
    window.location.hash = sessionId;
  } catch (err) { console.error("Failed to load session:", err); }
  loadSessions();
}
