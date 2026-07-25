import { getSamplingParams } from "../chat/state.js";
import {trace,debug} from "../../utils/logger.js"

/**
 * Extension that injects sampling parameters (temperature, top_p, top_k)
 * into the provider request payload before each LLM call.
 *
 * Registered as an inline extensionFactory in pi-resource-loader.js.
 */
export function samplingExt(pi) {
  pi.on("before_provider_request", async (event, ctx) => {
    const sessionId = ctx?.sessionManager?.sessionId;
    if (!sessionId) return event.payload;

    const params = getSamplingParams(sessionId);
    debug("got session sampling params",params)
    if (!params) return event.payload;

    const payload = { ...event.payload };

    if (params.temperature !== undefined && params.temperature !== null) {
      payload.temperature = Number(params.temperature);
    }
    if (params.top_p !== undefined && params.top_p !== null) {
      payload.top_p = Number(params.top_p);
    }
    if (params.top_k !== undefined && params.top_k !== null) {
      payload.top_k = Number(params.top_k);
    }
    trace('payload after sampling:',payload)
    return payload;
  });
}
