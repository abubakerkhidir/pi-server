import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import path from "path";
import { loadSettingsFromDb } from "../db/settings-dao";
import { createResourceLoader } from "./pi-resource-loader";
import { DEFAULT_TOOLS, bindSessionExtensions, applyUserModel } from "./pi-session-utils";


/**
 * Load an existing pi session from file.
 */
export async function loadExistingSession(sessionFile, userId) {
  const sessionDir = path.dirname(sessionFile);
  const sessionManager = SessionManager.open(sessionFile);
  const resourceLoader = await createResourceLoader(sessionDir);
  const userMap = loadSettingsFromDb(userId);
  const tools = userMap.tools_enabled || DEFAULT_TOOLS;

  // Discover skills
  const { skills, diagnostics } = resourceLoader.getSkills();
  console.log(`[PiSession] Loaded session, discovered ${skills.length} skills:`, skills.map(s => s.name));

  const { session } = await createAgentSession({
    sessionManager,
    resourceLoader,
    cwd: sessionDir,
    tools: tools,
    sessionStartEvent: { type: "session_start", reason: "resume" },
  });

  await bindSessionExtensions(session);
  await applyUserModel(session, userId);

  return session;
}
