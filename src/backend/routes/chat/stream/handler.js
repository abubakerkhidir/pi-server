import { calculateTokenStats, saveTokenStats, updateSessionContextUsage } from "./token-stats.js";
import { autoSaveGeneratedFile, isFileGeneratingTool, interceptViewImage, normalizeToolName } from "./file-handler.js";

/**
 * Create an SSE event writer helper.
 * @param {Object} res - Express response object
 * @returns {Function} writeEvent function
 */
export function createSSEWriter(res) {
  return function writeEvent(event, data) {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
}

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
  const lastThink = entityBuffer.lastEntity('think');
  if (lastThink && !lastThink.saved) {
    lastThink.content += event.content;
  } else {
    entityBuffer.sealAndSave('msg');
    entityBuffer.addEntity({
      type: 'think',
      content: event.content,
      startedAt: Date.now(),
      saved: false,
    });
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
  entityBuffer.addEntity({
    type: 'tool',
    toolId: event.id,
    toolName: event.name,
    toolArgs: event.args ?? {},
    result: null,
    isError: false,
    isComplete: false,
    startedAt: Date.now(),
    saved: false,
  });
  writeEvent("tool_start", {
    id: event.id,
    name: event.name,
    args: event.args,
  });
}

/**
 * Handle tool_update event from pi session.
 */
function handleToolUpdateEvent(event, entityBuffer, writeEvent) {
  const tool = entityBuffer.findToolEntity(event.id);
  if (tool) tool.partialResult = event.partialResult;
  writeEvent("tool_update", {
    id: event.id,
    name: event.name,
    partialResult: event.partialResult,
  });
}

/**
 * Handle tool_end event from pi session.
 * For file-generating tools, auto-save the file and modify the result.
 */
async function handleToolEndEvent(event, entityBuffer, writeEvent, params) {
  const { recordId, dbSessionId, userId, req } = params;
  const tool = entityBuffer.findToolEntity(event.id);
  let toolName = event.name
  let args = tool?.toolArgs
  if(toolName === 'mcp' && tool?.toolArgs?.tool){
    toolName = tool.toolArgs.tool;
    console.log('parsed mcp args, tool:',toolName)
  }
  console.log(`[Handler:handleToolEndEvent] ========== START ==========`, {toolName: event.name,toolId: event.id,hasResult: !!event.result,isError: event.isError,}, args, tool?JSON.stringify(tool):undefined);
  
  let finalResult = event.result;
  let info = null;
  
  // Check if this is a view_image call that should be intercepted
  const normalizedName = normalizeToolName(toolName);
  if (normalizedName === 'view_image' || toolName?.includes('view_image')) {
    console.log(`[Handler:handleToolEndEvent] Detected view_image call, checking for interception`);
    const interceptionResult = interceptViewImage(normalizedName, args, userId);
    if (interceptionResult) {
      console.log(`[Handler:handleToolEndEvent] Intercepting view_image, returning rejection`);
      saveToolToBuffer(tool, interceptionResult, false, entityBuffer);
      // Write the tool_end event with the interception result
      writeEvent("tool_end", {id: event.id, name: event.name, args: event.args, result: interceptionResult, isError: false});
      return;
    }
  }
  
  // Check if this is a file-generating tool
  if (isFileGeneratingTool(toolName, event.result) && event.result) {
    console.log(`[Handler:handleToolEndEvent] Detected file-generating tool: ${event.name}`);
    saveToolToBuffer(tool, event.result, !!event.isError, entityBuffer);
    // Get the entity ID from the saved tool
    const entityId = tool?.dbEntityId || null;
    console.log(`[Handler:handleToolEndEvent] Entity ID: ${entityId}`);
    
    // Auto-save the file
    console.log(`[Handler:handleToolEndEvent] Calling autoSaveGeneratedFile...`);
    info = await autoSaveGeneratedFile({toolName: event.name,result: event.result,args: event.args,recordId,sessionId: dbSessionId,userId,entityId,req});
    
    console.log(`[Handler:handleToolEndEvent] autoSaveGenFile returned:`, info ? {fileId: info.fileId,fileName: info.fileName,hasModifiedResult: !!info.modifiedResult} : 'null');
    
    // Use modified result if file was saved
    if (info) {
      finalResult = info.modifiedResult;
      console.log(`[Handler:handleToolEndEvent] Using modified result with piFileId: ${info.fileId}`);
      writeEvent("file_saved", {fileId: info.fileId,fileName: info.fileName,fileSize: info.fileSize,mimeType: info.mimeType,toolName: event.name});
    } else {
      console.log(`[Handler:handleToolEndEvent] autoSaveGeneratedFile returned null, using original result`);
    }
  } else {
    console.log(`[Handler:handleToolEndEvent] Not a file-generating tool or no result`);
    saveToolToBuffer(tool, event.result, !!event.isError, entityBuffer);
  }
  
  console.log(`[Handler:handleToolEndEvent] ========== END ==========`, {toolName: event.name,hasPiFileId: !!finalResult?.piFileId,assetUrl: finalResult?.asset_url,resultKeys: Object.keys(finalResult || {})});
  console.log(`[Handler:handleToolEndEvent] FINAL RESULT BEING SENT TO LLM:`, JSON.stringify(finalResult, null, 2)?.substring(0, 2000));
  writeEvent("tool_end", {id: event.id,name: event.name,args: event.args,result: finalResult,isError: event.isError,});
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
  const tokenStats = calculateTokenStats(state.usageData, responseStartTime, state.firstTokenTime);
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
  const {
    writeEvent,
    entityBuffer,
    dbSessionId,
    recordId,
    responseStartTime,
    userId,
    req,
  } = params;

  const state = {
    firstTokenTime: null,
    usageData: null,
    contextUsage: null,
  };

  // Handler params that need to be passed to async handlers
  const handlerParams = {
    recordId,
    dbSessionId,
    userId,
    req,
  };

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
        console.log(`[Handler:onEvent] Received tool_end event for: ${event.name} (id: ${event.id})`);
        // For file-generating tools, we must await the file save before emitting tool_end
        // so the modified result with new URLs is sent to the LLM.
        // The async handler will emit tool_end with the modified result after file save completes.
        handleToolEndEvent(event, entityBuffer, writeEvent, handlerParams)
          .catch(err => console.error("[Handler] tool_end error:", err));
        break;

      case "usage":
        handleUsageEvent(event, state);
        break;

      case "context_usage":
        handleContextUsageEvent(event, state);
        break;

      case "done": {
        const tokenStats = handleDoneEvent(
          entityBuffer, recordId, dbSessionId, responseStartTime, state
        );
        writeEvent("record_stats", tokenStats);
        break;
      }
    }
  }

  function getFirstTokenTime() { return state.firstTokenTime; }
  function getUsageData() { return state.usageData; }
  function getContextUsage() { return state.contextUsage; }

  return { onEvent, getFirstTokenTime, getUsageData, getContextUsage };
}
