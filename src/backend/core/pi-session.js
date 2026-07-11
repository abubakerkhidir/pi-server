// Workaround: Patch pi's hardcoded compaction defaults
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

// Re-export from new modules for backward compatibility
export { PiSessionManager, discoverAllTools } from "./pi-session-manager.js";
export { getDefaultSettings, loadUserSettings, saveUserSettings } from "./user-settings.js";
