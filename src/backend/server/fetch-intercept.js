/**
 * Intercepts HTTP responses from the LLM provider to capture usage data
 * (timings, token counts) without interfering with streaming.
 *
 * Uses response.clone() so the original body stream remains intact for Pi
 * to consume. The clone is read asynchronously — this does NOT block Pi's
 * streaming.
 */

// Shared state: latest raw response data, cleared per prompt
let lastRawResponse = null;

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
		//console.log('turn end: ',parsed.timings)
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
	  //console.log(line)
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
    // Clone the body stream BEFORE we do anything async
    // The clone is independent — consuming it does NOT affect the original
    const clone = response.clone();

    // Parse usage data from the clone asynchronously
    // This runs in the background — Pi can already be streaming from the original
    parseUsageFromSSEStream(clone.body).then((usageData) => {
      if (usageData) {
        lastRawResponse = {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          model: usageData.model || null,
          usage: usageData.usage,
          timings: usageData.timings || null,
        };
      }
    }).catch(() => {
      // Silent fail — original stream is unaffected
    });
  }

  // Return the original response — Pi gets the real, unconsumed body stream
  return response;
};

/**
 * Get the latest captured raw response data and clear the state
 * (call this once per prompt completion to get clean data).
 */
export function getAndClearRawResponse() {
  const data = lastRawResponse;
  lastRawResponse = null;
  return data;
}

export { lastRawResponse };
