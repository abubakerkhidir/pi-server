import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import fs from "fs";
import path from "path";
import { getDb } from "./db.js";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_TOOLS = ["read", "ls", "bash", "find", "grep", "get_search_content"];

export class PiSessionManager {
  constructor(cwd) {
    this.cwd = cwd;
    this.activeSessions = new Map();
    this.activeStreams = new Map();
  }

  async getOrCreateSession(userId, piSessionId) {
    if (piSessionId && this.activeSessions.has(piSessionId)) {
      return { session: this.activeSessions.get(piSessionId), piSessionId };
    }

    if (piSessionId) {
      const existing = this.activeSessions.get(piSessionId);
      if (existing) {
        return { session: existing, piSessionId };
      }
    }

    const db = getDb();
    const userRows = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId);
    const userMap = {};
    for (const r of userRows) {
      try { userMap[r.key] = JSON.parse(r.value); } catch { userMap[r.key] = r.value; }
    }
    const tools = userMap.tools_enabled || DEFAULT_TOOLS;
    const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
    const userDir = path.join(process.cwd(), "users", user?.username || "default");
    let sessionCwd = user?.home_dir || userDir;
    try { if (!fs.statSync(sessionCwd).isDirectory()) sessionCwd = userDir; } catch { sessionCwd = userDir; }

    const sessionManager = SessionManager.create(sessionCwd);
    const { session } = await createAgentSession({
      sessionManager,
      cwd: sessionCwd,
      tools,
    });

    const newPiSessionId = piSessionId || uuidv4();

    if (userMap.model_id) {
      try { session.setModel(userMap.model_id); } catch {}
    }

    this.activeSessions.set(newPiSessionId, session);
    this.activeStreams.set(newPiSessionId, new Set());

    return { session, piSessionId: newPiSessionId };
  }

  async prompt(piSessionId, text, { images, onEvent } = {}) {
    const session = this.activeSessions.get(piSessionId);
    if (!session) {
      throw new Error(`Session ${piSessionId} not found`);
    }

    const abortController = new AbortController();
    const streams = this.activeStreams.get(piSessionId);
    streams.add(abortController);

    const unsub = session.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (ev.type === "text_delta") {
            onEvent?.({ type: "text", content: ev.delta });
          } else if (ev.type === "thinking_delta") {
            onEvent?.({ type: "thinking", content: ev.delta });
          }
          break;
        }
        case "message_end": {
          // Extract token usage from the assistant message
          const msg = event.message;
          if (msg && msg.usage) {
            onEvent?.({
              type: "usage",
              input: msg.usage.input || 0,
              output: msg.usage.output || 0,
              reasoning: msg.usage.reasoning || 0,
              cacheRead: msg.usage.cacheRead || 0,
              cacheWrite: msg.usage.cacheWrite || 0,
            });
          }
          break;
        }
        case "tool_execution_start": {
          onEvent?.({
            type: "tool_start",
            id: event.toolCallId,
            name: event.toolName,
            args: event.args,
          });
          break;
        }
        case "tool_execution_update": {
          onEvent?.({
            type: "tool_update",
            id: event.toolCallId,
            name: event.toolName,
            partialResult: event.partialResult,
          });
          break;
        }
        case "tool_execution_end": {
          onEvent?.({
            type: "tool_end",
            id: event.toolCallId,
            name: event.toolName,
            args: event.args,
            result: event.result,
            isError: event.isError,
          });
          break;
        }
        case "agent_end": {
          onEvent?.({ type: "done" });
          break;
        }
      }
    });

    try {
      await session.prompt(text, {
        images,
        signal: abortController.signal,
      });
    } finally {
      unsub();
      streams.delete(abortController);
    }
  }

  async abort(piSessionId) {
    const streams = this.activeStreams.get(piSessionId);
    if (streams) {
      for (const controller of streams) {
        controller.abort();
      }
      streams.clear();
    }
  }

  async dispose() {
    for (const [id, session] of this.activeSessions) {
      await this.abort(id);
      session.dispose();
    }
    this.activeSessions.clear();
    this.activeStreams.clear();
  }
}

const toolsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export async function discoverAllTools(cwd) {
  const cached = toolsCache.get(cwd);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.tools;
  }

  const sessionManager = SessionManager.inMemory();
  const { session } = await createAgentSession({ sessionManager, cwd });
  try {
    const tools = session.getAllTools();
    toolsCache.set(cwd, { tools, ts: Date.now() });
    return tools;
  } finally {
    session.dispose();
  }
}

export function getDefaultSettings() {
  return {
    tools_enabled: DEFAULT_TOOLS,
    thinking_lines: 3,
    tool_lines: 5,
    model_id: "",
    send_on_enter: true,
    copy_text_as_plain: true,
    enable_continue: true,
    parse_pdf_as_image: false,
    confirm_title_change: true,
    first_line_title: true,
    llm_title: false,
    system_message: "",
    paste_to_file_length: 0,
    max_image_resolution: 0,
  };
}

export function loadUserSettings(db, userId) {
  const rows = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId);
  const settings = getDefaultSettings();
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  if (user) {
    settings.home_dir = user.home_dir || path.join(process.cwd(), "users", user.username);
    settings.username = user.username;
  }
  return settings;
}

export function saveUserSettings(db, userId, settings) {
  const upsert = db.prepare(
    "INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value"
  );
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      upsert.run(userId, key, JSON.stringify(value));
    }
  });
  transaction();
}
