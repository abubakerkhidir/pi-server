import { getAgentDir, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { comfyViewImgExt } from "../ext/comfyViewImgExt.js";
import { handleFileSaveEvent } from "../ext/fileSaverExt.js";
import { debug, info } from "../../utils/logger.js";


async function handleOnToolCallEvent(pi, event, ctx) {
  debug('Got event for toolCall: ', ctx?.sessionManager?.sessionId);
  await comfyViewImgExt(pi, event, ctx);
}

async function handleOnToolOuptutEvent(pi, event, ctx) {
  debug('Got event for toolOutput: ', ctx?.sessionManager?.sessionId, event.toolName, Object.keys(event).join(','));
  return await handleFileSaveEvent(pi, event, ctx);
}
/**
 * Create a resource loader for discovering skills and other resources.
 */
export async function createResourceLoader(sessionCwd) {
  const agentDir = getAgentDir();
  debug(`[PiSession] Creating resource loader with cwd: ${sessionCwd}, agentDir: ${agentDir}`);

  const loader = new DefaultResourceLoader({
    cwd: sessionCwd,
    agentDir,
    extensionFactories: [
      (pi) => {
        pi.on("tool_call", async (event, ctx) => { await handleOnToolCallEvent(pi, event, ctx); });
        pi.on("tool_result", async (event, ctx) => { return await handleOnToolOuptutEvent(pi, event, ctx); });
      }
    ]
  });
  debug('[ResourceLoader] loader created, reloading... ');

  // IMPORTANT: Must call reload() to actually discover skills!
  await loader.reload();

  // Debug: Check what skills were discovered
  const { skills, diagnostics } = loader.getSkills();
  debug(`[ResourceLoader] Discovered ${skills.length} skills:`);
  for (const skill of skills) {
    info(`  - ${skill.name}: filePath: ${skill.filePath}...`);
  }
  return loader;
}
