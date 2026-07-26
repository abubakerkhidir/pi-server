import { getSessionMeta, updateSessionStats } from "../db/session-dao.js";
import { fillUsageData, calculateTokenStats, saveTokenStats, updateSessionContextUsage } from "./token-stats.js";
import { getAndClearRawResponse } from "../../server/fetch-intercept.js";

/**
 * Handle text event from pi session.
 */
function handleTextEvent(event, entityBuffer, writeEvent, state) {
  if (state.firstTokenTime === null) state.firstTokenTime = Date.now();
  entityBuffer.sealAndSave('think');
  entityBuffer.sealAndSave('compact');
  const lastMsg = entityBuffer.lastEntity('msg');
  if (lastMsg && !lastMsg.saved) {
    lastMsg.content += event.content;
  } else {
    entityBuffer.addEntity({ type: 'msg', content: event.content, saved: false });
  }
  writeEvent("text", { content: event.content });
}

/**
 * Handle thinking event from pi session.
 */
function handleThinkingEvent(event, entityBuffer, writeEvent, state) {
  if (state.firstTokenTime === null) state.firstTokenTime = Date.now();
  state.thinkChars = (state.thinkChars || 0) + (event.content?.length || 0);
  entityBuffer.sealAndSave('compact');
  const lastThink = entityBuffer.lastEntity('think');
  if (lastThink && !lastThink.saved) {
    lastThink.content += event.content;
  } else {
    entityBuffer.sealAndSave('msg');
    entityBuffer.addEntity({type: 'think',content: event.content,startedAt: Date.now(),saved: false});
  }
  writeEvent("thinking", { content: event.content });
}

/**
 * Handle tool_start event from pi session.
 */
function handleToolStartEvent(event, entityBuffer, writeEvent, state) {
  if (state.firstTokenTime === null) state.firstTokenTime = Date.now();
  entityBuffer.sealAndSave('think');
  entityBuffer.sealAndSave('msg');
  entityBuffer.sealAndSave('compact');
  entityBuffer.addEntity({type: 'tool',toolId: event.id,toolName: event.name,toolArgs: event.args ?? {},result: null,isError: false,isComplete: false,startedAt: Date.now(),saved: false});
  writeEvent("tool_start", {id: event.id,name: event.name,args: event.args});
}

/**
 * Handle tool_update event from pi session.
 */
function handleToolUpdateEvent(event, entityBuffer, writeEvent) {
  const tool = entityBuffer.findToolEntity(event.id);
  if (tool) tool.partialResult = event.partialResult;
  writeEvent("tool_update", {id: event.id,name: event.name, partialResult: event.partialResult});
}

/**
 * Handle tool_end event from pi session.
 */
async function handleToolEndEvent(event, entityBuffer, writeEvent, params) {
  const tool = entityBuffer.findToolEntity(event.id);
  saveToolToBuffer(tool, event.result, !!event.isError, entityBuffer);
  writeEvent("tool_end", {id: event.id,name: event.name,args: event.args,result: event.result,isError: event.isError,});
}

function saveToolToBuffer(tool, reslt, err, entityBuffer) {
  if (tool) {
    tool.result = reslt;
    tool.isError = err;
    tool.isComplete = true;
    entityBuffer.saveEntity(tool);
  }
}

/**
 * Handle usage event from pi session — accumulate across multiple API calls.
 * Also stores current-turn usage for the turn_end handler.
 */
function handleUsageEvent(event, state) {
  fillUsageData(event, state);
  // Track per-turn usage (accumulated if multiple message_end per turn, reset at turn_end)
  if (!state.currentTurnUsage) {
    state.currentTurnUsage = {
      input: event.input || 0,
      output: event.output || 0,
      reasoning: event.reasoning || 0,
      cacheRead: event.cacheRead || 0,
      cacheWrite: event.cacheWrite || 0,
    };
  } else {
    state.currentTurnUsage.input += event.input || 0;
    state.currentTurnUsage.output += event.output || 0;
    state.currentTurnUsage.reasoning += event.reasoning || 0;
    state.currentTurnUsage.cacheRead += event.cacheRead || 0;
    state.currentTurnUsage.cacheWrite += event.cacheWrite || 0;
  }
}

/**
 * Handle turn_end event — create a turn entity with usage + timing stats.
 * This fires after all tools in the turn have finished executing.
 */
function handleTurnEndEvent(event, entityBuffer, writeEvent, state, dbSessionId) {
  state.turnNumber++;

  // Calculate turn duration
  const turnDurationMs = state.turnStart ? Date.now() - state.turnStart : null;

  // Calculate ttft for this turn (time from turn start to first token)
  const ttftMs = (state.turnStart && state.firstTokenTime)
    ? state.firstTokenTime - state.turnStart
    : null;

  // Get usage from the turn_end event (most authoritative)
  const usage = event.usage || state.currentTurnUsage || {};

  // Get raw timings from fetch-intercept (llama.cpp specific)
  const rawResp = getAndClearRawResponse(dbSessionId);

  // Build turn stats object
  const turnStats = {
    turn: state.turnNumber,
    prompt_tokens: usage.input || 0,
    output_tokens: usage.output || 0,
    think_tokens: usage.reasoning || 0,
    cache_read: usage.cacheRead || 0,
    cache_write: usage.cacheWrite || 0,
    ttft_ms: ttftMs,
    duration_ms: turnDurationMs,
    stop_reason: event.stopReason || "stop",
    tool_calls_count: event.toolCallsCount || 0,
  };

  // Attach raw LLM provider timings if available
  if (rawResp?.timings) {
    turnStats.prompt_ms = rawResp.timings.prompt_ms;
    turnStats.predicted_ms = rawResp.timings.predicted_ms;
    turnStats.predicted_per_token_ms = rawResp.timings.predicted_per_token_ms;
    turnStats.predicted_per_second = rawResp.timings.predicted_per_second;
    turnStats.draft_n = rawResp.timings.draft_n || 0;
    turnStats.draft_n_accepted = rawResp.timings.draft_n_accepted || 0;
  }
  if (rawResp?.usage) {
    turnStats.raw_usage = rawResp.usage;
  }

  // Use raw LLM timings when available (inference speed, not wall-clock)
  if (rawResp?.timings) {
    turnStats.prompt_per_sec = rawResp.timings.prompt_per_second;
    turnStats.output_per_sec = rawResp.timings.predicted_per_second;
  } else if (turnStats.duration_ms > 0) {
    // Fallback to computed values only if no raw timings
    turnStats.output_per_sec = Math.round((turnStats.output_tokens / turnStats.duration_ms) * 1000);
    if (ttftMs > 0) {
      turnStats.prompt_per_sec = Math.round((turnStats.prompt_tokens / ttftMs) * 1000);
    }
  }

  // Store turn stats for aggregate calculation
  state.turns.push(turnStats);

  // Create turn entity
  entityBuffer.addEntity({
    type: 'turn',
    content: JSON.stringify(turnStats),
    startedAt: state.turnStart,
    saved: false,
  });
  entityBuffer.sealAndSave('turn');

  // Reset per-turn state
  state.currentTurnUsage = null;
  state.firstTokenTime = null;
  state.turnStart = Date.now();

  // Send turn event to frontend
  writeEvent("turn_end", turnStats);
}

/**
 * Handle compact_start event - seal previous entities (safety) and add compact entity.
 */
function handleCompactStartEvent(entityBuffer, writeEvent, state) {
  entityBuffer.sealAndSave('think');
  entityBuffer.sealAndSave('msg');
  state.compactStartedAt = Date.now();
  state.beforeCompact = {...state.sessionTotals};
  entityBuffer.addEntity({type: 'compact', summary: null, tokensBefore: null, tokensAfter: null, savedPct: null, startedAt: state.compactStartedAt, saved: false});
  writeEvent("compact_start", { startedAt: state.compactStartedAt });
}

/**
 * Handle compact_result event - update compact entity with data and seal it.
 */
function handleCompactResultEvent(event, entityBuffer, writeEvent, state) {
  const compact = entityBuffer.lastEntity('compact');
  if (compact && !compact.saved) {
    compact.summary = event.summary;
    compact.tokensBefore = event.tokensBefore;
    compact.tokensAfter = event.tokensAfter;
    compact.savedPct = event.savedPct;
  }
  entityBuffer.sealAndSave('compact');
  const duration = state.compactStartedAt ? Date.now() - state.compactStartedAt : null;
  state.compactStartedAt = null;
  handleUsageEvent({input:event.tokensBefore, output:event.tokensAfter,cacheRead:0,cacheWrite:0,reasoning:0}, state);
  const ctxWindow = state.contextUsage?.contextWindow || 128000;
  state.contextUsage = {contextSize: event.tokensAfter, contextWindow: ctxWindow, contextPercent: ctxWindow > 0 ? (event.tokensAfter / ctxWindow) * 100 : 0};
  writeEvent("compact_result", {summary: event.summary,tokensBefore: event.tokensBefore,tokensAfter: event.tokensAfter,savedPct: event.savedPct,duration,failed: event.failed});
}

/**
 * Handle context_usage event from pi session.
 */
function handleContextUsageEvent(event, state) {
  state.contextUsage = {contextSize: event.contextSize,contextWindow: event.contextWindow,contextPercent: event.contextPercent};
}

/**
 * Handle done event - flush entities and save aggregate token stats.
 * Turn-level stats are already saved by handleTurnEndEvent.
 * This saves the per-record aggregate and session totals.
 */
function handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state, session) {
  entityBuffer.flushAll();
  const tokenStats = calculateTokenStats(state.usageData, responseStartTime, state, session);

  saveTokenStats(recordId, tokenStats);
  updateSessionStats(dbSessionId, tokenStats.sessionTotals);
  return tokenStats;
}

/**
 * Create the onEvent handler for the pi session prompt.
 * @param {Object} params - Handler parameters
 * @returns {Function} onEvent handler
 */
export function createStreamEventHandler(params) {
  const {writeEvent,entityBuffer,dbSessionId,recordId,responseStartTime,userId,req,session} = params;
  const s = getSessionMeta(dbSessionId);
  const sessionTotals = s.total_input ? {
    total_input: s.total_input, total_cache_read: s.total_cache_read, total_cache_write: s.total_cache_write, total_cost: s.total_cost,
    total_reasoning: s.total_reasoning, total_output: s.total_output, context_used: s.context_used, context_size: s.context_size, context_percent: s.context_percent
  } : {total_input: 0, total_cache_read: 0, total_cache_write: 0, total_reasoning: 0, total_output: 0, context_used: 0, context_size: 128000, context_percent: 0, total_cost: 0};

  const state = {
    firstTokenTime: null,
    usageData: null,
    contextUsage: null,
    thinkChars: 0,
    compactStartedAt: null,
    sessionTotals,
    beforeCompact: null,
    turnNumber: 0,
    turns: [],
    currentTurnUsage: null,
    turnStart: responseStartTime,
  };

  const handlerParams = {recordId, dbSessionId, userId, req};
  let onAgentEndResolve = undefined;
  let lastEvent = {event: undefined};
  const onAgentEnd = new Promise((r) => { onAgentEndResolve = r; });
  const ss = {thinkCount: 0, textCount: 0};

  function onEvent(event) {
    switch (event.type) {
      case "text":
        ss.textCount = ss.textCount + 1;
        handleTextEvent(event, entityBuffer, writeEvent, state);
        break;

      case "thinking":
        ss.thinkCount = ss.thinkCount + 1;
        handleThinkingEvent(event, entityBuffer, writeEvent, state);
        break;

      case "tool_start":
        handleToolStartEvent(event, entityBuffer, writeEvent, state);
        break;

      case "tool_update":
        handleToolUpdateEvent(event, entityBuffer, writeEvent);
        break;

      case "tool_end":
        handleToolEndEvent(event, entityBuffer, writeEvent, handlerParams).catch(err => console.error("[Handler] tool_end error:", err));
        break;

      case "usage":
        handleUsageEvent(event, state);
        break;

      case "turn_end":
        handleTurnEndEvent(event, entityBuffer, writeEvent, state, dbSessionId);
        break;

      case "compact_start":
        handleCompactStartEvent(entityBuffer, writeEvent, state);
        break;

      case "compact_result":
        handleCompactResultEvent(event, entityBuffer, writeEvent, state);
        break;

      case "context_usage":
        handleContextUsageEvent(event, state);
        break;

      case "error":
      case "done": {
        const tokenStats = handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state, session);
        writeEvent("record_stats", tokenStats);
        lastEvent.event = event;
        console.log('got done-event, thinkCount: ', ss.thinkCount, ', textCount: ', ss.textCount, ', turns: ', state.turnNumber, event.type === 'error' ? event : 'done');
        onAgentEndResolve();
        break;
      }
    }
  }

  function getFirstTokenTime() { return state.firstTokenTime; }
  function getUsageData() { return state.usageData; }
  function getContextUsage() { return state.contextUsage; }

  return { onEvent, getFirstTokenTime, getUsageData, getContextUsage, onAgentEnd, lastEvent };
}
