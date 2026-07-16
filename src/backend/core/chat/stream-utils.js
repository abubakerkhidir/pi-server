

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
 * Write SSE metadata event for video info.
 */
export function writeVideoMetadata(writeEvent, videoInfo, imageCount) {
  if (videoInfo) {
    writeEvent("metadata", {
      type: "metadata",
      frames: imageCount,
      video: videoInfo,
    });
  }
}
/**
 * Write session info event with model and record ID.
 */
export function writeSessionEvent(writeEvent, dbSessionId, modelInfo, recordId) {
  writeEvent("session", {
    sessionId: dbSessionId,
    model: modelInfo,
    recordId,
  });
}
/**
 * Write error event and close response.
 */
export function writeErrorResponse(res, message) {
  if (!res.writableEnded) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
}
/**
 * Write done event and close response.
 */
export function writeDoneEvent(writeEvent, res, lastEvent) {
  console.log('writting done-event: ',res.writableEnded)
  if (!res.writableEnded) {
    if(lastEvent.type !== 'done')
      console.log('lastEvent is not done: ',lastEvent)
    writeEvent(lastEvent.type??"done", {});
    res.end();
  }
}
/**
 * Wrap onEvent to track full text for session naming.
 */
export function wrapOnEventForNaming(onEvent) {
  let fullText = "";
  const wrappedOnEvent = (event) => {
    if (event.type === "text") fullText += event.content;
    onEvent(event);
  };
  return { wrappedOnEvent, getFullText: () => fullText };
}
