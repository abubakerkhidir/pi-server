import { loadSettingsFromDb } from "../db/settings-dao.js";


//const DEFAULT_TOOLS = ["read", "ls", "bash", "find", "grep", "get_search_content"];
export const DEFAULT_TOOLS = [];
/**
 * Create a stub UI context for non-interactive sessions.
 */
function createStubUiContext() {
  return {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: (msg, type) => console.log(`[MCP ${type}] ${msg}`),
    onTerminalInput: () => () => { },
    setStatus: () => { },
    setWorkingMessage: () => { },
    setWorkingVisible: () => { },
    setWorkingIndicator: () => { },
    setHiddenThinkingLabel: () => { },
    getToolsExpanded: () => false,
    setToolsExpanded: () => { },
    theme: {
      fg: (_style, text) => text,
      bg: (_style, text) => text,
      bold: (text) => text,
      dim: (text) => text,
      italic: (text) => text,
      underline: (text) => text,
    },
  };
}
/**
 * Bind extensions to session (needed for MCP adapter etc.).
 */
export async function bindSessionExtensions(session) {
  await session.bindExtensions({
    mode: "rpc",
    uiContext: createStubUiContext(),
  });
}
/**
 * Set the user's model if configured.
 */
export async function applyUserModel(session, userId) {
  const userMap = loadSettingsFromDb(userId);
  if (userMap.model_id && !session.model) {
    try {
      await session.setModel(userMap.model_id);
    } catch { }
  }
}

// Workaround: Patch pi's hardcoded compaction defaults
export function initCompactionAtts(){
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const compactionPath = path.join(__dirname, '../../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/harness/compaction/compaction.js');
    
    if (fs.existsSync(compactionPath)) {
      const compaction = await import('file://' + compactionPath);
      if (compaction.DEFAULT_COMPACTION_SETTINGS) {
        compaction.DEFAULT_COMPACTION_SETTINGS.keepRecentTokens = parseInt(process.env.PI_COMPACT_KEEP_RECENT || '2000');
        console.log('Patched compaction settings: keepRecentTokens =', compaction.DEFAULT_COMPACTION_SETTINGS.keepRecentTokens);
      }
    } else {
      console.warn('Compaction module not found at:', compactionPath);
    }
  } catch (e) {
    console.warn('Failed to patch compaction settings:', e.message);
  }
}