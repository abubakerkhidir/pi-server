

export function comfyViewImgExt(pi,event, ctx){
    // Target your specific tool (e.g., bash)
    if (event.toolName === "mcp") {
        console.log('***** on mcp tool call: ', JSON.stringify(event))
        // const command = event.input?.command || "";
        
        // // Apply your custom argument blacklist
        // const isBlacklisted = command.includes("rm -rf") || command.includes("dropdb");
        
        // if (isBlacklisted) {
        //      ctx.ui.notify(`Blocked unsafe command: ${command}`, "error");
        //     // Stop execution and throw a rejection string back to the LLM
        //     throw new Error(`Execution Rejected: '${command}' matches system blacklist criteria.`);
        // }
    }
}