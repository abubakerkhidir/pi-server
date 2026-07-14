import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import { loadSettingsFromDb } from "../db/settings-dao.js";
import { createResourceLoader } from "./pi-resource-loader.js";
import { DEFAULT_TOOLS, bindSessionExtensions } from "./pi-session-utils.js";

/**
 * Create a new pi session with user settings.
 */
export async function createNewSession(userId, sessionCwd) {
  const userMap = loadSettingsFromDb(userId);
  const tools = userMap.tools_enabled || DEFAULT_TOOLS;
  console.log(`[PiSession] Creating session with tools:`, tools);

  const sessionManager = SessionManager.create(sessionCwd);
  const resourceLoader = await createResourceLoader(sessionCwd);

  // Discover skills
  const { skills, diagnostics } = resourceLoader.getSkills();
  console.log(`[PiSession] Discovered ${skills.length} skills:`, skills.map(s => s.name));
  if (diagnostics.length > 0) {
    console.log("[PiSession] Skill diagnostics:", diagnostics);
  }

  const { session } = await createAgentSession({
    sessionManager,
    resourceLoader,
    cwd: sessionCwd,
    tools,
    sessionStartEvent: { type: "session_start", reason: "new" },
  });

  // Debug: Check what's in the system prompt
  const systemPrompt = session.systemPrompt;
  const hasSkillsSection = systemPrompt.includes('<available_skills>');
  const hasReadTool = systemPrompt.includes('- read:');
  console.log(`[PiSession] System prompt has skills section: ${hasSkillsSection}`);
  console.log(`[PiSession] System prompt has read tool: ${hasReadTool}`);
  if (hasSkillsSection) {
    const skillsStart = systemPrompt.indexOf('<available_skills>');
    const skillsEnd = systemPrompt.indexOf('</available_skills>') + 20;
    console.log(`[PiSession] Skills section:`, systemPrompt.substring(skillsStart, skillsEnd));
  } else {
    console.log(`[PiSession] WARNING: Skills NOT in system prompt!`);
    // Show what tools ARE in the prompt
    const toolsMatch = systemPrompt.match(/Available tools:\n([\s\S]*?)\n\n/);
    if (toolsMatch) {
      console.log(`[PiSession] Tools in prompt:`, toolsMatch[1]);
    }
  }

  await bindSessionExtensions(session);

  if (userMap.model_id) {
    try {
      await session.setModel(userMap.model_id);
    } catch { }
  }
  console.log("\n\n#### System Prompt: \n\n", systemPrompt);
  return session;
}
