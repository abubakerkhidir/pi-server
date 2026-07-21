import { getSessionMeta, updateSessionStats } from "../db/session-dao.js";
import { fillUsageData,calculateTokenStats, saveTokenStats, updateSessionContextUsage } from "./token-stats.js";

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
 * For file-generating tools, auto-save the file and modify the result.
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

//Handle usage event from pi session - accumulate across multiple API calls. Also tracks cumulative lifetime tokens (survives compaction resets).
function handleUsageEvent(event, state) {
  fillUsageData(event,state)
}

/**
 * Handle compact_start event - seal previous entities (safety) and add compact entity.
 */
function handleCompactStartEvent(entityBuffer, writeEvent, state) {
  entityBuffer.sealAndSave('think');
  entityBuffer.sealAndSave('msg');
  state.compactStartedAt = Date.now();
  state.beforeCompact = {...state.sessionTotals}
  entityBuffer.addEntity({type: 'compact', summary: null, tokensBefore: null, tokensAfter: null, savedPct: null, startedAt: state.compactStartedAt, saved: false});
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
  writeEvent("compact_result", {summary: event.summary,tokensBefore: event.tokensBefore,tokensAfter: event.tokensAfter,savedPct: event.savedPct,duration});
}

/**
 * Handle context_usage event from pi session.
 */
function handleContextUsageEvent(event, state) {
  state.contextUsage = {contextSize: event.contextSize,contextWindow: event.contextWindow,contextPercent: event.contextPercent};
}

/**
 * Handle done event - flush entities and save token stats.
 */
function handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state, session) {
  entityBuffer.flushAll();
  const tokenStats = calculateTokenStats(state.usageData, responseStartTime, state, session);
  saveTokenStats(recordId, tokenStats);
  updateSessionStats(dbSessionId, tokenStats.sessionTotals)
  //updateSessionContextUsage(dbSessionId, state.contextUsage);
  return tokenStats
}

/**
 * Create the onEvent handler for the pi session prompt.
 * @param {Object} params - Handler parameters
 * @returns {Function} onEvent handler
 */
export function createStreamEventHandler(params) {
  const {writeEvent,entityBuffer,dbSessionId,recordId,responseStartTime,userId,req,session} = params;
  const s = getSessionMeta(dbSessionId)
  const sessionTotals = s.total_input?{total_input: s.total_input, total_cache_read:s.total_cache_read, total_cache_write:s.total_cache_write,total_cost:s.total_cost, 
                          total_reasoning: s.total_reasoning, total_output: s.total_output,context_used:s.context_used, context_size:s.context_size, context_percent:s.context_percent}:
                        {total_input: 0, total_cache_read:0, total_cache_write:0, total_reasoning: 0, total_output: 0,context_used:0,context_size:128000,context_percent:0,total_cost:0}
  const state = {firstTokenTime: null, usageData: null, contextUsage: null, thinkChars: 0, compactStartedAt: null, sessionTotals, beforeCompact:null};

  // Handler params that need to be passed to async handlers
  const handlerParams = {recordId,dbSessionId,userId,req,};
  let onAgentEndResolve = undefined
  let lastEvent = {event:undefined}
  const onAgentEnd = new Promise((r) => { onAgentEndResolve = r; });

  function onEvent(event) {
    switch (event.type) {
      case "text":
        handleTextEvent(event, entityBuffer, writeEvent, state);
        break;

      case "thinking":
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
        if(event.sendDirectly){
          lastEvent.event = event
          onAgentEndResolve();
        }else{
          const tokenStats = handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state, session);
          writeEvent("record_stats", tokenStats);
          lastEvent.event = event
          onAgentEndResolve();
        }
        break;
      }

    }
  }

  function getFirstTokenTime() { return state.firstTokenTime; }
  function getUsageData() { return state.usageData; }
  function getContextUsage() { return state.contextUsage; }

  return { onEvent, getFirstTokenTime, getUsageData, getContextUsage, onAgentEnd, lastEvent };
}
