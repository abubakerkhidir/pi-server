import { createAgentSession, SessionManager, DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
import fs from "fs";
import path from "path";
import { getDb } from "./db.js";
import { v4 as uuidv4 } from "uuid";
import { comfyViewImgExt } from "./ext/comfyViewImgExt.js";
import { handleFileSaveEvent } from "./ext/fileSaverExt.js";

//const DEFAULT_TOOLS = ["read", "ls", "bash", "find", "grep", "get_search_content"];
const DEFAULT_TOOLS = [];

// Custom instruction to force skill loading before MCP tool use
//const SKILL_LOADING_INSTRUCTION = `

//## CRITICAL SKILL LOADING RULE
//Before using ANY MCP tool (like generate_image, search, etc.), you MUST first check if a skill matches the user's request. If a skill matches, use the read tool to load the skill file BEFORE calling the MCP tool. This is mandatory. Failure to load the skill first will result in incorrect tool usage.
//`;

/**
 * Create a stub UI context for non-interactive sessions.
 */
function createStubUiContext() {
  return {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: (msg, type) => console.log(`[MCP ${type}] ${msg}`),
    onTerminalInput: () => () => {},
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
    theme: {
      fg: (_style, text) => text,
      bg: (_style, text) => text,
      bold: (text) => text,
      dim: (text) => text,
      italic: (text) => text,
      underline: (text) => text,
    },
  };
}

/**
 * Bind extensions to session (needed for MCP adapter etc.).
 */
async function bindSessionExtensions(session) {
  await session.bindExtensions({
    mode: "rpc",
    uiContext: createStubUiContext(),
  });
}

/**
 * Load user settings from database.
 */
function loadSettingsFromDb(userId) {
  const db = getDb();
  const userRows = db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId);
  const userMap = {};

  for (const r of userRows) {
    try {
      userMap[r.key] = JSON.parse(r.value);
    } catch {
      userMap[r.key] = r.value;
    }
  }

  return userMap;
}

/**
 * Get the user's home directory.
 */
function getUserHomeDir(userId) {
  const db = getDb();
  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  const userDir = path.join(process.cwd(), "users", user?.username || "default");
  let sessionCwd = user?.home_dir || userDir;

  try {
    if (!fs.statSync(sessionCwd).isDirectory()) sessionCwd = userDir;
  } catch {
    sessionCwd = userDir;
  }

  return sessionCwd;
}

/**
 * Set the user's model if configured.
 */
async function applyUserModel(session, userId) {
  const userMap = loadSettingsFromDb(userId);
  if (userMap.model_id && !session.model) {
    try {
      await session.setModel(userMap.model_id);
    } catch {}
  }
}

async function handleOnToolCallEvent(pi, event,ctx){
  console.log('Got event for toolCall: ',ctx?.sessionId, ctx??Object.keys(ctx), JSON.stringify(event))
  await comfyViewImgExt(pi,event,ctx)
}

async function handleOnToolOuptutEvent(pi, event,ctx){
  console.log('Got event for toolOutput: ',ctx?.sessionId, ctx??Object.keys(ctx), JSON.stringify(event))
  return await handleFileSaveEvent(pi, event, ctx)
  //comfyViewImgExt(pi,event,ctx)
}

/**
 * Create a resource loader for discovering skills and other resources.
 */
async function createResourceLoader(sessionCwd) {
  const agentDir = getAgentDir();
  console.log(`[PiSession] Creating resource loader with cwd: ${sessionCwd}, agentDir: ${agentDir}`);
  
  const loader = new DefaultResourceLoader({
    cwd: sessionCwd,
    agentDir,
    extensionFactories: [
      (pi)=> {
        pi.on("tool_call", async (event, ctx) => { await handleOnToolCallEvent(pi, event,ctx)});
        pi.on("tool_result", async (event, ctx) => {return await handleOnToolOuptutEvent(pi, event,ctx)});
      }
    ]
  });
  console.log('loader created, reloading... ')

  // IMPORTANT: Must call reload() to actually discover skills!
  await loader.reload();
  
  // Debug: Check what skills were discovered
  const { skills, diagnostics } = loader.getSkills();
  console.log(`[ResourceLoader] Discovered ${skills.length} skills:`);
  for (const skill of skills) {
    console.log(`  - ${skill.name}: filePath: ${skill.filePath}...`);
  }
  return loader;
}

/**
 * Create a new pi session with user settings.
 */
async function createNewSession(userId, sessionCwd) {
  const userMap = loadSettingsFromDb(userId);
  const tools = userMap.tools_enabled || DEFAULT_TOOLS;
  console.log(`[PiSession] Creating session with tools:`, tools);

  const sessionManager = SessionManager.create(sessionCwd);
  const resourceLoader = await createResourceLoader(sessionCwd);
  
  // Discover skills
  const { skills, diagnostics } = resourceLoader.getSkills();
  console.log(`[PiSession] Discovered ${skills.length} skills:`, skills.map(s => s.name));
  if (diagnostics.length > 0) {
    console.log("[PiSession] Skill diagnostics:", diagnostics);
  }

  const { session } = await createAgentSession({
    sessionManager,
    resourceLoader,
    cwd: sessionCwd,
    tools,
    sessionStartEvent: { type: "session_start", reason: "new" },
  });

  // Debug: Check what's in the system prompt
  const systemPrompt = session.systemPrompt;
  const hasSkillsSection = systemPrompt.includes('<available_skills>');
  const hasReadTool = systemPrompt.includes('- read:');
  console.log(`[PiSession] System prompt has skills section: ${hasSkillsSection}`);
  console.log(`[PiSession] System prompt has read tool: ${hasReadTool}`);
  if (hasSkillsSection) {
    const skillsStart = systemPrompt.indexOf('<available_skills>');
    const skillsEnd = systemPrompt.indexOf('</available_skills>') + 20;
    console.log(`[PiSession] Skills section:`, systemPrompt.substring(skillsStart, skillsEnd));
  } else {
    console.log(`[PiSession] WARNING: Skills NOT in system prompt!`);
    // Show what tools ARE in the prompt
    const toolsMatch = systemPrompt.match(/Available tools:\n([\s\S]*?)\n\n/);
    if (toolsMatch) {
      console.log(`[PiSession] Tools in prompt:`, toolsMatch[1]);
    }
  }

  await bindSessionExtensions(session);

  if (userMap.model_id) {
    try {
      await session.setModel(userMap.model_id);
    } catch {}
  }
  console.log("\n\n#### System Prompt: \n\n", systemPrompt)
  return session;
}

/**
 * Load an existing pi session from file.
 */
async function loadExistingSession(sessionFile, userId) {
  const sessionDir = path.dirname(sessionFile);
  const sessionManager = SessionManager.open(sessionFile);
  const resourceLoader = await createResourceLoader(sessionDir);
  const userMap = loadSettingsFromDb(userId);
  const tools = userMap.tools_enabled || DEFAULT_TOOLS;
   
  // Discover skills
  const { skills, diagnostics } = resourceLoader.getSkills();
  console.log(`[PiSession] Loaded session, discovered ${skills.length} skills:`, skills.map(s => s.name));

  const { session } = await createAgentSession({
    sessionManager,
    resourceLoader,
    cwd: sessionDir,
    tools: tools,
    sessionStartEvent: { type: "session_start", reason: "resume" },
  });

  await bindSessionExtensions(session);
  await applyUserModel(session, userId);

  return session;
}

/**
 * Store the session file path in database.
 */
function storeSessionFilePath(dbSessionId, sessionFile) {
  const db = getDb();
  try {
    db.prepare(
      "UPDATE session_metadata SET pi_session_file = ? WHERE id = ?"
    ).run(sessionFile, dbSessionId);
  } catch (err) {
    console.warn("Failed to store session file path:", err.message);
  }
}

export class PiSessionManager {
  constructor(cwd) {
    this.cwd = cwd;
    this.activeSessions = new Map();
    this.activeStreams = new Map();
  }

  async getOrCreateSession(userId, piSessionId) {
    // Check in-memory cache first
    if (piSessionId && this.activeSessions.has(piSessionId)) {
      return { session: this.activeSessions.get(piSessionId), piSessionId };
    }

    const db = getDb();

    // If we have a piSessionId, try to load the session from the database
    if (piSessionId) {
      const meta = db.prepare(
        "SELECT pi_session_file FROM session_metadata WHERE id = ?"
      ).get(piSessionId);

      if (meta?.pi_session_file && fs.existsSync(meta.pi_session_file)) {
        try {
          const session = await loadExistingSession(meta.pi_session_file, userId);
          this.activeSessions.set(piSessionId, session);
          this.activeStreams.set(piSessionId, new Set());

          console.log("Loaded existing pi session:", piSessionId, "from:", meta.pi_session_file);
          return { session, piSessionId };
        } catch (err) {
          console.warn("Failed to load session from file:", err.message);
        }
      }
    }

    // Create a new session
    const sessionCwd = getUserHomeDir(userId);
    const session = await createNewSession(userId, sessionCwd);

    const newPiSessionId = session.id || piSessionId || uuidv4();

    // Store the session file path in the database for future loading
    if (session.sessionFile) {
      storeSessionFilePath(newPiSessionId, session.sessionFile);
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
          try {
            const ctxUsage = session.getContextUsage();
            onEvent?.({
              type: "context_usage",
              contextSize: ctxUsage?.tokens ?? null,
              contextWindow: ctxUsage?.contextWindow ?? null,
              contextPercent: ctxUsage?.percent ?? null,
            });
          } catch {}
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

/**
 * Discover all available tools for a given working directory.
 */
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
