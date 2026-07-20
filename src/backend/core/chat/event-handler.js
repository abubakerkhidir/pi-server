import { calculateTokenStats, saveTokenStats, updateSessionContextUsage } from "./token-stats.js";


/**
 * Handle text event from pi session.
 */
function handleTextEvent(event, entityBuffer, writeEvent, state) {
  if (state.firstTokenTime === null) state.firstTokenTime = Date.now();
  entityBuffer.sealAndSave('think');
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

/**
 * Handle usage event from pi session - accumulate across multiple API calls.
 */
function handleUsageEvent(event, state) {
  if (!state.usageData) {
    state.usageData = {
      prompt_tokens: event.input || 0,
      output_tokens: event.output || 0,
      think_tokens: event.reasoning || 0,
      cache_read: event.cacheRead || 0,
      cache_write: event.cacheWrite || 0,
    };
  } else {
    state.usageData.prompt_tokens += event.input || 0;
    state.usageData.output_tokens += event.output || 0;
    state.usageData.think_tokens += event.reasoning || 0;
    state.usageData.cache_read += event.cacheRead || 0;
    state.usageData.cache_write += event.cacheWrite || 0;
  }
}

/**
 * Handle context_usage event from pi session.
 */
function handleContextUsageEvent(event, state) {
  state.contextUsage = {
    contextSize: event.contextSize,
    contextWindow: event.contextWindow,
    contextPercent: event.contextPercent,
  };
}

/**
 * Handle done event - flush entities and save token stats.
 */
function handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state) {
  entityBuffer.flushAll();
  // If provider didn't report reasoning tokens but thinking content exists, estimate from char count
  if (state.usageData && !state.usageData.think_tokens && state.thinkChars > 0) {
    state.usageData.think_tokens = Math.round(state.thinkChars / 4);
  }
  const tokenStats = calculateTokenStats(state.usageData, responseStartTime, state) //.firstTokenTime);
  saveTokenStats(recordId, tokenStats);
  updateSessionContextUsage(dbSessionId, state.contextUsage);
  return tokenStats;
}

/**
 * Create the onEvent handler for the pi session prompt.
 * @param {Object} params - Handler parameters
 * @returns {Function} onEvent handler
 */
export function createStreamEventHandler(params) {
  const {writeEvent,entityBuffer,dbSessionId,recordId,responseStartTime,userId,req} = params;

  const state = {firstTokenTime: null,usageData: null,contextUsage: null,thinkChars: 0};

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

      case "compact_result":
        writeEvent("compact_result", {
          summary: event.summary,
          tokensBefore: event.tokensBefore,
          tokensAfter: event.tokensAfter,
          savedPct: event.savedPct,
        });
        break;

      case "context_usage":
        handleContextUsageEvent(event, state);
        break;

      case "error": 
      case "done": {
        const tokenStats = handleDoneEvent(entityBuffer, recordId, dbSessionId, responseStartTime, state);
        writeEvent("record_stats", tokenStats);
        lastEvent.event = event
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
