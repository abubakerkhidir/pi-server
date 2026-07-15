import { fullDebug } from "../core/chat/state.js";

export function trace(...args){
    if(fullDebug())
        console.log(...args)
}