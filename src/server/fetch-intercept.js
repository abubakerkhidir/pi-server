/**
 * Intercepts HTTP responses from the LLM provider to capture usage data
 * (timings, token counts) without interfering with streaming.
 *
 * Uses response.clone() so the original body stream remains intact for Pi
 * to consume. The clone is read asynchronously — this does NOT block Pi's
 * streaming.
 *
 * Session-aware: stores per-session response data in a Map keyed by
 * sessionId extracted from request headers (session_id / x-client-request-id).
 */

// Per-session raw response data, keyed by sessionId
const rawResponsesBySession = new Map();

/**
 * Extract sessionId from fetch request headers.
 * pi-ai sets session_id and x-client-request-id when sessionId is provided.
 */
function extractSessionId(headers) {
  if (!headers) return null;
  // Headers can be a Headers object, plain object, or array of arrays
  const get = (name) => {
    if (typeof headers.get === "function") return headers.get(name);
    if (Array.isArray(headers)) {
      const found = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
      return found ? found[1] : null;
    }
    if (typeof headers === "object") {
      // Check both original and lowercase keys
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === name.toLowerCase()) return v;
      }
    }
    return null;
  };
  return get("session_id") || get("x-client-request-id") || null;
}

/**
 * Parse the last usage chunk from an SSE stream without buffering the whole thing.
 * The SSE format is: data: {...}\n data: {...}\n ... data: {...usage...}\n data: [DONE]\n
 * We track the last non-DONE data line that contains a usage block.
 */
function parseUsageFromSSEStream(cloneBody) {
  return new Promise((resolve) => {
    let lastDataLine = null;
    const reader = cloneBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    (function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          // If lastDataLine has a usage block, parse and return it
          if (lastDataLine) {
            try {
              const parsed = JSON.parse(lastDataLine.replace(/^data:\s*/, ""));
              if (parsed.usage) {
                resolve(parsed);
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: [DONE]")) break; // stop at end
          if (line.startsWith("data: ")) {
            lastDataLine = line;
          }
        }

        read();
      }).catch(() => {
        // If clone read fails, resolve null — original stream still works
        resolve(null);
      });
    })();
  });
}

// Store the original fetch
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const response = await originalFetch(url, init);
  const urlStr = url.toString();

  // Only intercept LLM API calls — catches OpenRouter, local llama.cpp, and any
  // OpenAI-compatible endpoint that uses the standard /chat/completions path.
  const isLLMCall = urlStr.includes("/chat/completions");

  if (isLLMCall && response.body) {
    // Extract sessionId from request headers
    const sessionId = extractSessionId(init?.headers);

    // Clone the body stream BEFORE we do anything async
    // The clone is independent — consuming it does NOT affect the original
    const clone = response.clone();

    // Parse usage data from the clone asynchronously
    // This runs in the background — Pi can already be streaming from the original
    parseUsageFromSSEStream(clone.body).then((usageData) => {
      if (usageData) {
        const data = {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          model: usageData.model || null,
          usage: usageData.usage,
          timings: usageData.timings || null,
        };
        if (sessionId) {
          rawResponsesBySession.set(sessionId, data);
        } else {
          // Fallback for requests without sessionId — use a shared key
          rawResponsesBySession.set("__default__", data);
        }
      }
    }).catch(() => {
      // Silent fail — original stream is unaffected
    });
  }

  // Return the original response — Pi gets the real, unconsumed body stream
  return response;
};

/**
 * Get the latest captured raw response data for a session and clear it.
 * Call this once per turn completion to get clean data.
 * @param {string} sessionId - The session ID to get data for
 */
export function getAndClearRawResponse(sessionId) {
  const key = sessionId || "__default__";
  const data = rawResponsesBySession.get(key);
  if (data) {
    rawResponsesBySession.delete(key);
  }
  return data;
}

/**
 * Clear all captured response data for a session.
 * Call this when a session is disposed or disconnected.
 */
export function clearRawResponses(sessionId) {
  if (sessionId) {
    rawResponsesBySession.delete(sessionId);
  } else {
    rawResponsesBySession.clear();
  }
}

export { rawResponsesBySession };
