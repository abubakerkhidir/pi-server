import { useRef } from "react";
import { marked } from "marked";
import { createChatStream, type AbortChatStream } from "@/frontend/api";
import { escapeHtmlSimple, extractText } from "@/frontend/lib/escapeHtml";
import { formatToolResult } from "@/frontend/lib/formatters";

marked.setOptions({ breaks: true, gfm: true });

interface ThinkingBlockData {
  el: HTMLDivElement;
  bodyEl: HTMLDivElement | null;
  contentEl: HTMLDivElement | null;
  sealed: boolean;
}

interface StreamState {
  flowDiv: HTMLDivElement;
  rawText: string;
  toolIndicators: Map<string, HTMLDivElement>;
  lastEl: HTMLDivElement | null;
  thinkingBlocks: ThinkingBlockData[];
}

interface UseChatStreamOptions {
  currentSessionId: string | null;
  isProcessing: boolean;
  userSettings: { tool_lines: number };
  chatRef: React.RefObject<HTMLDivElement | null>;
  welcomeRef: React.RefObject<HTMLDivElement | null>;
  setCurrentSessionId: (id: string | null) => void;
  setIsProcessing: (v: boolean) => void;
  setUploadedFiles: (f: File[]) => void;
  loadSessions: () => Promise<void>;
}

const toolDetails = (name: string, args: Record<string, unknown> | undefined): string => {
  if (["write", "read", "ctx_read", "ctx_write", "edit", "ctx_edit"].includes(name)) return String(args?.path || args?.file) || "";
  if (["bash", "shell", "ctx_shell"].includes(name)) return String(args?.command || args?.cmd) || "";
  if (["grep", "ctx_search", "ctx_semantic_search"].includes(name)) return String(args?.pattern || args?.query) || "";
  if (["ls", "ctx_tree", "ctx_glob", "find", "glob"].includes(name)) return String(args?.path || args?.pattern || args?.glob) || "";
  return "";
};

export function useChatStream({
  currentSessionId, isProcessing, userSettings, chatRef, welcomeRef,
  setCurrentSessionId, setIsProcessing, setUploadedFiles, loadSessions,
}: UseChatStreamOptions) {
  const streamStateRef = useRef<StreamState | null>(null);

  const addUserMessage = (text: string) => {
    if (welcomeRef.current) welcomeRef.current.style.display = "none";
    const el = document.createElement("div");
    el.className = "message user";
    el.innerHTML = `<div class="message-header">You</div><div class="message-content"><p>${escapeHtmlSimple(text)}</p></div>`;
    chatRef.current?.appendChild(el);
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  };

  const handleSend = async (prompt: string, files: File[]) => {
    if (!prompt || isProcessing) return;
    setIsProcessing(true); setUploadedFiles([]);
    addUserMessage(prompt);
    const msg = document.createElement("div");
    msg.className = "message assistant";
    msg.innerHTML = `<div class="message-header">PI</div><div class="message-content"><div class="message-flow"></div><div class="typing" id="typingIndicator"><span></span><span></span><span></span></div></div>`;
    chatRef.current?.appendChild(msg);
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
    const flowDiv = msg.querySelector(".message-flow") as HTMLDivElement;
    const sm: StreamState = { flowDiv, rawText: "", toolIndicators: new Map(), lastEl: null, thinkingBlocks: [] };
    streamStateRef.current = sm;
    const createThinkingBlock = (): HTMLDivElement => {
      const tb = document.createElement("div");
      tb.className = "thinking-block";
      tb.innerHTML = `<div class="cb-header"><span class="arr-btn arr-expand" title="Expand">▶</span><span class="arr-btn arr-down arr-hidden" title="Expand fully">▼</span><span class="arr-btn arr-up arr-hidden" title="Collapse">▲</span><span class="cb-label">Thinking</span></div><div class="cb-body" style="display:none;"><div class="cb-content"></div></div>`;
      const bodyEl = tb.querySelector(".cb-body") as HTMLDivElement;
      const contentEl = bodyEl?.querySelector(".cb-content") as HTMLDivElement;
      sm.thinkingBlocks.push({ el: tb, bodyEl, contentEl, sealed: false });
      flowDiv.appendChild(tb); return tb;
    };
    let abortStream: AbortChatStream | null = null;

    const handleToggleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement)?.closest(".arr-btn");
      if (!btn) return;
      const header = btn.closest(".cb-header");
      if (!header) return;
      const body = header.parentElement?.querySelector(".cb-body") as HTMLDivElement;
      if (!body) return;
      const expandBtn = header.querySelector(".arr-expand") as HTMLElement;
      const downBtn = header.querySelector(".arr-down") as HTMLElement;
      const upBtn = header.querySelector(".arr-up") as HTMLElement;
      const isExpanded = body.style.display !== "none" && !body.classList.contains("collapsed");
      if (isExpanded) {
        body.style.display = "none"; body.classList.add("collapsed");
        expandBtn?.classList.remove("arr-hidden"); downBtn?.classList.add("arr-hidden"); upBtn?.classList.add("arr-hidden");
      } else {
        body.style.display = ""; body.classList.remove("collapsed");
        body.style.maxHeight = ""; body.style.overflow = ""; body.style.webkitLineClamp = "unset";
        expandBtn?.classList.add("arr-hidden"); downBtn?.classList.remove("arr-hidden"); upBtn?.classList.remove("arr-hidden");
      }
      e.preventDefault();
    };

    // Set up delegation on chat container
    chatRef.current?.addEventListener("click", handleToggleClick);

    const handleToolStart = (data: Record<string, unknown>, containerEl: HTMLDivElement & {
      _toolName: string; _toolArgs: Record<string, unknown> | undefined; _isWrite: boolean;
      _writeLines?: number; _writeChars?: number; _startTime?: number; _counterInterval?: ReturnType<typeof setInterval>;
    }) => {
      const toolName = data.name as string, toolArgs = data.args as Record<string, unknown> | undefined;
      const isWrite = toolName === "write", isEdit = toolName === "edit";
      containerEl._toolName = toolName; containerEl._toolArgs = toolArgs; containerEl._isWrite = isWrite;
      let bodyHtml = "", footerHtml = "";
      if (isWrite && toolArgs && toolArgs.content) {
        const c = typeof toolArgs.content === "string" ? toolArgs.content : JSON.stringify(toolArgs.content);
        const lines = c.split("\n").length, chars = c.length;
        footerHtml = `<div class="tool-footer" data-lines="${lines}" data-chars="${chars}">Written ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars</div>`;
        containerEl._writeLines = lines; containerEl._writeChars = chars; containerEl._startTime = Date.now();
      }
      if (!isEdit) {
        const fullArgs = toolArgs ? escapeHtmlSimple(JSON.stringify(toolArgs, null, 2)) : "";
        bodyHtml = (fullArgs ? `<pre class="tool-params">${fullArgs}</pre>` : "") + '<div class="tool-output"></div>';
      }
      containerEl.innerHTML = `<div class="cb-header"><span class="arr-btn arr-expand arr-hidden" title="Expand">▶</span><span class="arr-btn arr-down arr-hidden" title="Expand fully">▼</span><span class="arr-btn arr-up" title="Collapse">▲</span><span class="tool-status"><span class="spinner"></span></span><span class="cb-label">${escapeHtmlSimple(toolName + (toolArgs ? "(" + JSON.stringify(toolArgs).slice(0, 97) + ")" : ""))}</span></div><div class="cb-body">${bodyHtml}${footerHtml}</div>`;
      const ctrl = containerEl.querySelector(".cb-body");
      if (ctrl instanceof HTMLElement) {
        ctrl.style.maxHeight = (21 * (userSettings.tool_lines || 5)) + "px";
        ctrl.style.overflow = "hidden"; ctrl.style.webkitLineClamp = String(userSettings.tool_lines || 5);
        ctrl.classList.add("collapsed");
      }
      if (isWrite) {
        containerEl._counterInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - (containerEl._startTime || Date.now())) / 1000);
          const footer = containerEl.querySelector(".tool-footer");
          if (footer) footer.textContent = `Writing — ${(containerEl._writeLines || 0).toLocaleString()} lines / ${(containerEl._writeChars || 0).toLocaleString()} chars (${elapsed}s)`;
        }, 1000);
      }
    };

    const handleToolEnd = (id: string, data: Record<string, unknown>, block: HTMLDivElement) => {
      const blockEl = block as unknown as HTMLDivElement & { _counterInterval?: ReturnType<typeof setInterval>; _toolName: string; _toolArgs: Record<string, unknown> | undefined; _isEdit?: boolean };
      if (blockEl._counterInterval) { clearInterval(blockEl._counterInterval); blockEl._counterInterval = undefined; }
      const header = block.querySelector(".cb-header");
      (header?.querySelector(".spinner") as HTMLElement)?.remove();
      const statusEl = header?.querySelector(".tool-status");
      if (statusEl) {
        // Backend sends isError (capital I) — use bracket notation to match
        const isErr = data["isError"] as boolean;
        statusEl.innerHTML = isErr ? "✗" : "✓";
        statusEl.className = `tool-status ${isErr ? "error" : "done"}`;
      }
      const isEdit = blockEl._isEdit === true;
      if (data.result && !isEdit) { const oe = block.querySelector(".tool-output"); if (oe) oe.textContent += extractText(data.result); }
      const formatted = formatToolResult(blockEl._toolName, data.result, blockEl._toolArgs);
      if (formatted) {
        const body = block.querySelector(".cb-body");
        if (body instanceof HTMLElement) {
          body.innerHTML = formatted.bodyHtml;
          // Expand body FIRST so footer isn't clipped by overflow:hidden / line-clamp
          body.style.maxHeight = ""; body.style.overflow = ""; body.style.webkitLineClamp = "unset"; body.classList.remove("collapsed");
          if (formatted.footerHtml) body.insertAdjacentHTML("beforeend", formatted.footerHtml);
        }
      } else {
        // Generate fallback footer from args if no formatter provided one
        const toolName = blockEl._toolName;
        const toolArgs = blockEl._toolArgs as Record<string, unknown> | undefined;
        const isWriteTool = toolName === "write" || toolName === "ctx_write";
        let fallbackFooter = "";
        if (isWriteTool && toolArgs?.content) {
          const contentStr = typeof toolArgs.content === "string" ? toolArgs.content : JSON.stringify(toolArgs.content);
          const lines = contentStr.split("\n").length;
          const chars = contentStr.length;
          fallbackFooter = `<div class="tool-footer">Written ${lines.toLocaleString()} lines / ${chars.toLocaleString()} chars</div>`;
        } else {
          const path = String(toolArgs?.path || toolArgs?.filePath || toolArgs?.file || "");
          fallbackFooter = `<div class="tool-footer">${escapeHtmlSimple(toolName)}${path ? " — " + escapeHtmlSimple(path) : ""}</div>`;
        }
        const body = block.querySelector(".cb-body");
        if (body instanceof HTMLElement) {
          body.style.maxHeight = ""; body.style.overflow = ""; body.style.webkitLineClamp = "unset"; body.classList.remove("collapsed");
          body.insertAdjacentHTML("beforeend", fallbackFooter);
        }
      }
    };

    const finalizeTools = () => {
      for (const [, b] of sm.toolIndicators) {
        const header = b.querySelector(".cb-header"), spinner = header?.querySelector(".spinner"), statusEl = header?.querySelector(".tool-status");
        if (spinner) spinner.remove();
        if (statusEl) { statusEl.innerHTML = "✓"; statusEl.className = "tool-status done"; }
      }
      sm.toolIndicators.clear();
    };

    const sealLastThinking = () => {
      const tb = sm.thinkingBlocks[sm.thinkingBlocks.length - 1];
      if (!tb || tb.sealed) return;
      tb.sealed = true;
      (tb.el.querySelector(".spinner") as HTMLElement)?.remove();
      (tb.el.querySelector(".arr-expand") as HTMLElement)?.classList.remove("arr-hidden");
      tb.bodyEl?.classList.add("collapsed");
    };
    const sealAllThinking = () => {
      for (let i = sm.thinkingBlocks.length - 1; i >= 0; i--) {
        const tb = sm.thinkingBlocks[i]; if (!tb.sealed) {
          tb.sealed = true;
          (tb.el.querySelector(".spinner") as HTMLElement)?.remove();
          (tb.el.querySelector(".arr-expand") as HTMLElement)?.classList.remove("arr-hidden");
          tb.bodyEl?.classList.add("collapsed");
        }
      }
    };
    const appendToThinking = (content: string) => {
      const tb = sm.thinkingBlocks[sm.thinkingBlocks.length - 1];
      if (tb?.bodyEl && tb?.contentEl) { tb.bodyEl.style.display = "block"; tb.contentEl.textContent += content; }
    };
    const updateScroll = () => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });

    abortStream = createChatStream(
      currentSessionId, prompt, files.length > 0 ? files : undefined,
      (event: string, data: Record<string, unknown>) => {
        switch (event) {
          case "session": {
            setCurrentSessionId(data.sessionId as string);
            const mt = document.getElementById("modelTags");
            if (mt && (data.model as Record<string, unknown>)?.name)
              mt.innerHTML = `<span style="font-size:11px;color:var(--text-dim);">${escapeHtmlSimple((data.model as Record<string, unknown>).name as string)}</span>`;
            break;
          }
          case "thinking": {
            const lastBlock = sm.thinkingBlocks[sm.thinkingBlocks.length - 1];
            if (lastBlock && !lastBlock.sealed) appendToThinking(String(data.content || ""));
            else { const tb = createThinkingBlock(); sm.lastEl = tb; appendToThinking(String(data.content || "")); }
            updateScroll();
            break;
          }
          case "text": {
            sealLastThinking();
            let mdEl = sm.lastEl;
            if (!mdEl || mdEl.classList.contains("tool-block") || mdEl.classList.contains("thinking-block")) {
              mdEl = document.createElement("div"); mdEl.className = "markdown";
              flowDiv.appendChild(mdEl); sm.lastEl = mdEl; sm.rawText = "";
            }
            sm.rawText += String(data.content || "");
            mdEl.innerHTML = (marked.parse(sm.rawText) as string).replace(/\n+$/, "");
            updateScroll();
            break;
          }
          case "tool_start": {
            sealLastThinking();
            const toolId = data.id as string;
            const container = document.createElement("div");
            container.className = "tool-block"; container.dataset.toolId = toolId;
            const containerEl = container as unknown as HTMLDivElement & {
              _toolName: string; _toolArgs: Record<string, unknown> | undefined; _isWrite: boolean;
              _writeLines?: number; _writeChars?: number; _startTime?: number; _counterInterval?: ReturnType<typeof setInterval>;
            };
            handleToolStart(data, containerEl);
            flowDiv.appendChild(container); sm.lastEl = container;
            sm.toolIndicators.set(toolId, container);
            break;
          }
          case "tool_update": {
            const block = sm.toolIndicators.get(data.id as string);
            const outputEl = block?.querySelector(".tool-output");
            if (outputEl && data.partialResult) outputEl.textContent += extractText(data.partialResult);
            break;
          }
          case "tool_end": {
            const id = data.id as string, block = sm.toolIndicators.get(id);
            if (block) handleToolEnd(id, data, block);
            sm.toolIndicators.delete(id);
            break;
          }
          case "done": {
            sealAllThinking();
            const ti = msg.querySelector("#typingIndicator");
            if (ti instanceof HTMLElement) ti.style.display = "none";
            finalizeTools(); setIsProcessing(false); loadSessions();
            break;
          }
          case "error": {
            sealAllThinking();
            const ti = msg.querySelector("#typingIndicator");
            if (ti instanceof HTMLElement) ti.style.display = "none";
            const errorDiv = document.createElement("p") as HTMLParagraphElement;
            errorDiv.style.color = "var(--danger)";
            errorDiv.textContent = `Error: ${(data.error as string) || "Unknown error"}`;
            flowDiv.appendChild(errorDiv); setIsProcessing(false);
            break;
          }
        }
      },
      (err: Error) => {
        sealAllThinking();
        const ti = msg.querySelector("#typingIndicator");
        if (ti instanceof HTMLElement) ti.style.display = "none";
        const errorDiv = document.createElement("p") as HTMLParagraphElement;
        errorDiv.style.color = "var(--danger)";
        errorDiv.textContent = `Error: ${err.message}`;
        flowDiv.appendChild(errorDiv); setIsProcessing(false);
      },
    );
    const observer = new MutationObserver(() => {
      if (!document.body.contains(msg) && abortStream) { abortStream(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    if (welcomeRef.current) welcomeRef.current.style.display = "";
    chatRef.current?.querySelectorAll(".message")?.forEach((m) => m.remove());
    streamStateRef.current = null; setUploadedFiles([]); setIsProcessing(false); loadSessions();
  };
  return { handleSend, handleNewChat, streamStateRef };
}
