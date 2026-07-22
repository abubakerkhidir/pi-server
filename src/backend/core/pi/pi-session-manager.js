import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { getSessionMeta} from "../db/session-dao.js";
import { loadExistingSession } from "./pi-session-loader.js";
import { createNewSession } from "./pi-new-session.js";
import { warning } from "../../utils/logger.js";
import { BUILTIN_COMMANDS, parseBuiltinCommand, executeBuiltinCommand } from "./pi-commands.js";
import { getPiModelById, computeThinkingLevels, findFallbackLevel } from "./pi-model-mngmt.js";

export class PiSessionManager {
  constructor(cwd) {
    this.cwd = cwd;
    this.activeSessions = new Map();
    this.activeStreams = new Map();
  }

  async getOrCreateSession(userId, piSessionId,provider,model,thinkLevel,homeDir) {
    // Check in-memory cache first
    if (piSessionId && this.activeSessions.has(piSessionId)) {
      return { session: this.activeSessions.get(piSessionId), piSessionId };
    }
    console.log('getOrCreateSession: ',userId, piSessionId)
    // If we have a piSessionId, try to load the session from the database
    if (piSessionId) {
      const meta = getSessionMeta(piSessionId);
      console.log('found session meta in db: ', meta)
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
      }else{
        warning('session file not found: ',meta?.pi_session_file)
      }
    }

    // Create a new session
    const session = await createNewSession(userId, homeDir,provider,model,thinkLevel);
    console.log('created new sesion: ',session.sessionId,session.sessionFile)
    const newPiSessionId = session.sessionId || piSessionId || uuidv4();

    this.activeSessions.set(newPiSessionId, session);
    this.activeStreams.set(newPiSessionId, new Set());
    return { session, piSessionId: newPiSessionId };
  }

  /**
   * Load a session into the active list if not already loaded.
   */
  async ensureSessionLoaded(piSessionId, userId) {
    if (!piSessionId) return null;
    if (this.activeSessions.has(piSessionId)) {
      return this.activeSessions.get(piSessionId);
    }
    const { session } = await this.getOrCreateSession(userId, piSessionId);
    return session;
  }

  getCommands(piSessionId) {
    const session = this.activeSessions.get(piSessionId);
    if (!session) return [];
    const extensionCmds = session.getCommands?.() ?? [];
    return [
      ...BUILTIN_COMMANDS.map((c) => ({ name: c.name, description: c.description, source: "builtin" })),
      ...extensionCmds.map((c) => ({ name: c.name, description: c.description || "", source: c.source || "extension" })),
    ];
  }

  async setModelOnSession(piSessionId, provider, modelId, userId) {
    console.log('setModelOnSession: ',provider,modelId)
    // Load session if not already in active list
    const session = await this.ensureSessionLoaded(piSessionId, userId);
    if (!session) throw new Error(`Session ${piSessionId} not found`);
    const model = session.modelRegistry.find(provider, modelId);
    if (!model) throw new Error(`Model ${provider}/${modelId} not found`);
    await session.setModel(model);
    // Determine available levels for new model
    const availableLevels = model.thinkingLevelMap?Object.keys(m.thinkingLevelMap):[];
    console.log(' >>> done setModelOnSession: ',provider,modelId, session.thinkingLevel,session.model)
    return { model: { id: model.id, name: model.name, provider: model.provider, input: model.input, reasoning: model.reasoning }, availableLevels};
  }

  async setThinkingLevel(piSessionId, level, userId) {
    console.log('set-think-level to : ',level)
    // Load session if not already in active list
    const session = await this.ensureSessionLoaded(piSessionId, userId);
    if (!session) throw new Error(`Session ${piSessionId} not found`);
    try {
      await session.setThinkingLevel(level);
    } catch (err) {
      throw new Error(`Failed to set thinking level: ${err.message}`);
    }
    console.log('>>>> done set-think-level to : ',level)
    return session.thinkingLevel;
  }

  async prompt(piSessionId, text, { images, onEvent, modelId, modelProvider, thinkLevel } = {}) {
    const session = this.activeSessions.get(piSessionId);
    if (!session) {
      throw new Error(`Session ${piSessionId} not found`);
    }

    // Intercept built-in slash commands (e.g. /compact)
    const builtin = parseBuiltinCommand(text);
    if (builtin) {
      await executeBuiltinCommand(builtin.name, builtin.args, session, onEvent);
      return;
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
          //console.log('msg-End event: ',msg.usage)
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
        case "compaction_start": {
          onEvent?.({ type: "compact_start", reason: event.reason });
          break;
        }
        case "compaction_end": {
          if (event.result && !event.aborted) {
            const { summary, tokensBefore, estimatedTokensAfter } = event.result;
            const savedPct = tokensBefore > 0 ? Math.round((1 - estimatedTokensAfter / tokensBefore) * 100): 0;
            onEvent?.({type: "compact_result",summary,tokensBefore,tokensAfter: estimatedTokensAfter,savedPct,failed:false});
          }else{
            onEvent?.({type: "compact_result",summary:event.errorMessage??'Compact failed due to unkown err',failed:true});
          }
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
