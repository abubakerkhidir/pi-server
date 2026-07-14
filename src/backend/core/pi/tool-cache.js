import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";


const toolsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
/**
 * Discover all available tools for a given working directory.
 */

export async function discoverAllTools(cwd) {
  const cached = toolsCache.get(cwd);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.tools;
  }

  const sessionManager = SessionManager.inMemory();
  const { session } = await createAgentSession({ sessionManager, cwd });

  try {
    const tools = session.getAllTools();
    toolsCache.set(cwd, { tools, ts: Date.now() });
    return tools;
  } finally {
    session.dispose();
  }
}

/**
 * Get group label for a tool source.
 */
export function getGroupLabel(source) {
  if (source === "builtin") return "Built-in";
  if (source === "auto") return "Auto";
  if (source.startsWith("npm:")) return source.slice(4);
  return source;
}

/**
 * Get fallback tools when discovery fails.
 */
export function getFallbackTools() {
  return [
    { name: "read", description: "Read file contents" },
    { name: "bash", description: "Execute bash commands" },
    { name: "edit", description: "Edit files with find/replace" },
    { name: "write", description: "Write files (creates/overwrites)" },
    { name: "grep", description: "Search file contents" },
    { name: "find", description: "Find files by glob pattern" },
    { name: "ls", description: "List directory contents" },
  ];
}
/**
 * Group tools by source.
 */
export function groupToolsBySource(tools) {
  const groups = new Map();

  for (const tool of tools) {
    const source = tool.sourceInfo?.source || "builtin";
    const groupLabel = getGroupLabel(source);

    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, { name: groupLabel, source, tools: [] });
    }
    groups.get(groupLabel).tools.push({
      name: tool.name,
      description: tool.description,
    });
  }

  return Array.from(groups.values());
}
export async function getGroupedTools() {
  const groupedTools = undefined;
  try {
    const allTools = await discoverAllTools(process.cwd());
    const groups = groupToolsBySource(allTools);
    groupedTools = { groups };
  } catch (err) {
    console.error("Tool discovery failed:", err.message);
    const fallback = getFallbackTools();
    groupedTools = { groups: [{ name: "Built-in", source: "builtin", tools: fallback }], _fallback: true };
  }
  return groupedTools;
}

