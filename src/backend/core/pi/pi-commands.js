/**
 * Built-in pi slash commands.
 * These are commands that map to direct session methods (not extension commands).
 * Extension/skill/template commands are passed through to session.prompt() unchanged.
 */

export const BUILTIN_COMMANDS = [
  { name: "compact", description: "Compact the session context to free up space" },
];

/**
 * Check if a prompt text is a built-in slash command.
 * Returns the command name (without slash) or null.
 */
export function parseBuiltinCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const builtin = BUILTIN_COMMANDS.find((c) => c.name === name);
  return builtin ? { name, args } : null;
}

/**
 * Execute a built-in command on a pi session.
 * Returns an async generator of events (same shape as onEvent calls in pi-session-manager).
 * @param {string} commandName
 * @param {string} args
 * @param {object} session - pi AgentSession instance
 */
export async function executeBuiltinCommand(commandName, args, session, onEvent) {
  if (commandName === "compact") {
    onEvent?.({ type: "compact_start", content: "Compacting session context…" });
    try {
      const result = await session.compact(args || undefined);
      const tokensBefore = result?.tokensBefore ?? 0;
      const tokensAfter = result?.estimatedTokensAfter ?? 0;
      const saved = tokensBefore > 0 ? Math.round((1 - tokensAfter / tokensBefore) * 100) : 0;
      onEvent?.({type:'usage', input:event.tokensBefore, output:event.tokensAfter,cacheRead:0,cacheWrite:0,reasoning:0})
      onEvent?.({type: "compact_result",summary: result?.summary ?? "",tokensBefore,tokensAfter,savedPct: saved,failed:false});
      console.log('session stats: ',session.getSessionStats(), session.getContextUsage())
    } catch (err) {
      onEvent?.({ type: "compact_result", summary: `Compaction failed: ${err.message}`,failed:true });
    }
    onEvent?.({ type: "done", sendDirectly:true });
    return;
  }
  throw new Error(`Unknown built-in command: ${commandName}`);
}

//todo send token-usage after compact, make sesion-stats in chatlayout uses backend event instead of calculating
//call session. getSessionStats(): SessionStats; and getContextUsage()
//tokens: {
    //     input: number;
    //     output: number;
    //     cacheRead: number;
    //     cacheWrite: number;
    //     total: number;
    // };
