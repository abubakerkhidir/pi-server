import { fullDebug, isDebug, isErr, isInfo, isTrace, isWarn } from "../core/chat/state.js";

export function trace(...args){ if(isTrace()) console.log(...args)}
export function debug(...args){ if(isDebug()) console.log(...args)}
export function info(...args){ if(isInfo()) console.log(...args)}
export function warning(...args){ if(isWarn()) console.log(...args)}
export function error(...args){ if(isErr()) console.log(...args)}