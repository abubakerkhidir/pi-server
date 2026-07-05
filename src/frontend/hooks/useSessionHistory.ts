import { getChatHistory } from "@/frontend/api";
import type { ChatRecord, ChatState, UserMsg, AgentReply, AgentReplyEntity } from "@/frontend/types";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { marked } from "marked";

marked.setOptions({ breaks: true, gfm: true });

// Backend response shape
interface BackendHistory {
  sessionId: string;
  name: string;
  messages: { id: string; role: string; content: string; created_at: string }[];
  thinking: { seq: number; content: string }[];
  tools: { seq: number; id: string; name: string; args: string; result: string; is_error?: number }[];
}

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

/**
 * Convert backend session data into ChatState format using entity types.
 */
export async function loadSessionHistory(sessionId: string): Promise<ChatState> {
  try {
    const history = await getChatHistory(sessionId);
    const h = history as BackendHistory;

    // Group tools by their id (tool_call_id)
    const toolGroups: Record<string, BackendHistory["tools"][0][]> = {};
    for (const t of h.tools || []) {
      if (!toolGroups[t.id]) toolGroups[t.id] = [];
      toolGroups[t.id].push(t);
    }

    // Group thinking by session
    const thinkingContent = (h.thinking || []).map((t) => t.content).join("\n");

    // Build ChatRecord[] from messages
    const records: ChatRecord[] = [];
    let currentRecord: ChatRecord | null = null;
    let entityIndex = 0;

    for (const msg of h.messages) {
      if (msg.role === "user") {
        // Flush previous agent reply
        if (currentRecord && currentRecord.agentReply.entities.length > 0) {
          records.push(currentRecord);
        }
        currentRecord = {
          id: msg.id,
          userMsg: { content: msg.content },
          agentReply: { id: msg.id, entities: [] },
        };
      } else if (msg.role === "assistant") {
        if (!currentRecord) {
          // Orphaned assistant message without user
          currentRecord = {
            id: msg.id,
            userMsg: { content: "" },
            agentReply: { id: msg.id, entities: [] },
          };
        }

        // Add thinking block if present
        if (thinkingContent) {
          currentRecord.agentReply.entities.push({
            type: "think",
            id: `think-${entityIndex++}`,
            content: thinkingContent,
          });
        }

        // Add tool blocks
        for (const [, entries] of Object.entries(toolGroups)) {
          const first = entries[0];
          const last = entries[entries.length - 1];
          if (!first) continue;

          let args: Record<string, unknown> = {};
          try { args = JSON.parse(first.args || "{}"); } catch { /* ignore */ }

          let result: unknown = null;
          try { result = JSON.parse(last.result || "null"); } catch { /* ignore */ }

          currentRecord.agentReply.entities.push({
            type: "tool",
            id: first.id,
            name: first.name,
            args,
            partialResult: undefined,
            result,
            isError: !!first.is_error,
            isComplete: true,
          });
        }

        // Add text message if present
        if (msg.content && msg.content !== "(no text response)") {
          currentRecord.agentReply.entities.push({
            type: "msg",
            id: `msg-${entityIndex++}`,
            content: msg.content,
            sealed: true,
          });
        }
      }
    }

    // Flush last record
    if (currentRecord) {
      records.push(currentRecord);
    }

    return { records };
  } catch (err) {
    console.error("Failed to load session:", err);
    return { records: [] };
  }
}
