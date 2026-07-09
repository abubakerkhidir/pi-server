import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { loadUserSettings, saveUserSettings, getDefaultSettings, discoverAllTools } from "../pi-session.js";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { getDb } from "../db.js";

const router = Router();

const BOOLEAN_FIELDS = [
  "send_on_enter", "copy_text_as_plain", "enable_continue",
  "parse_pdf_as_image", "confirm_title_change", "first_line_title", "llm_title",
];
const NUMBER_FIELDS = {
  thinking_lines: { min: 0, max: 20 },
  tool_lines: { min: 0, max: 50 },
  paste_to_file_length: { min: 0, max: 1_000_000 },
  max_image_resolution: { min: 0, max: 1000 },
};

router.get("/settings", authMiddleware, (req, res) => {
  const db = getDb();
  const settings = loadUserSettings(db, req.user.userId);
  res.json(settings);
});

router.put("/settings", authMiddleware, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Invalid settings payload" });
  }

  const db = getDb();
  const current = loadUserSettings(db, req.user.userId);

  if (updates.tools_enabled !== undefined) {
    if (!Array.isArray(updates.tools_enabled)) {
      return res.status(400).json({ error: "tools_enabled must be an array" });
    }
    current.tools_enabled = updates.tools_enabled;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (updates[field] !== undefined) {
      current[field] = !!updates[field];
    }
  }

  for (const [field, opts] of Object.entries(NUMBER_FIELDS)) {
    if (updates[field] !== undefined) {
      const n = Number(updates[field]);
      if (!Number.isInteger(n) || n < opts.min || n > opts.max) {
        return res.status(400).json({ error: `${field} must be an integer ${opts.min}-${opts.max}` });
      }
      current[field] = n;
    }
  }

  if (updates.system_message !== undefined) {
    if (typeof updates.system_message !== "string") {
      return res.status(400).json({ error: "system_message must be a string" });
    }
    current.system_message = updates.system_message;
  }

  if (updates.model_id !== undefined) {
    if (typeof updates.model_id !== "string") {
      return res.status(400).json({ error: "model_id must be a string" });
    }
    current.model_id = updates.model_id;
  }

  if (updates.home_dir !== undefined) {
    if (typeof updates.home_dir !== "string" || !updates.home_dir.trim()) {
      return res.status(400).json({ error: "home_dir must be a non-empty string" });
    }
    current.home_dir = updates.home_dir.trim();
    db.prepare("UPDATE users SET home_dir = ? WHERE id = ?").run(current.home_dir, req.user.userId);
  }

  saveUserSettings(db, req.user.userId, current);
  res.json(current);
});

router.get("/tools", authMiddleware, async (req, res) => {
  try {
    const allTools = await discoverAllTools(process.cwd());

    const groups = new Map();
    for (const tool of allTools) {
      const source = tool.sourceInfo?.source || "builtin";
      let groupLabel = source;
      if (source === "builtin") groupLabel = "Built-in";
      else if (source === "auto") groupLabel = "Auto";
      else if (source.startsWith("npm:")) groupLabel = source.slice(4);

      if (!groups.has(groupLabel)) {
        groups.set(groupLabel, { name: groupLabel, source, tools: [] });
      }
      groups.get(groupLabel).tools.push({
        name: tool.name,
        description: tool.description,
      });
    }

    res.json({ groups: Array.from(groups.values()) });
  } catch (err) {
    console.error("Tool discovery failed:", err.message);
    const fallback = [
      { name: "read", description: "Read file contents", sourceInfo: { source: "builtin" } },
      { name: "bash", description: "Execute bash commands", sourceInfo: { source: "builtin" } },
      { name: "edit", description: "Edit files with find/replace", sourceInfo: { source: "builtin" } },
      { name: "write", description: "Write files (creates/overwrites)", sourceInfo: { source: "builtin" } },
      { name: "grep", description: "Search file contents", sourceInfo: { source: "builtin" } },
      { name: "find", description: "Find files by glob pattern", sourceInfo: { source: "builtin" } },
      { name: "ls", description: "List directory contents", sourceInfo: { source: "builtin" } },
    ];
    res.json({
      groups: [{ name: "Built-in", source: "builtin", tools: fallback.map(t => ({ name: t.name, description: t.description })) }],
      _fallback: true,
    });
  }
});

router.get("/models", authMiddleware, async (req, res) => {
  try {
    const sm = SessionManager.inMemory();
    const { session } = await createAgentSession({ sessionManager: sm, cwd: process.cwd() });
    const models = session.modelRegistry.getAvailable();
    session.dispose();

    const providers = new Map();
    for (const m of models) {
      const key = m.provider || "unknown";
      if (!providers.has(key)) providers.set(key, []);
      providers.get(key).push({
        id: m.id,
        name: m.name,
        input: m.input,
        reasoning: !!m.reasoning,
      });
    }

    const groups = [];
    for (const [provider, list] of providers) {
      groups.push({ provider, models: list });
    }

    res.json({ groups });
  } catch (err) {
    console.error("Model discovery failed:", err.message);
    res.json({ groups: [] });
  }
});

export default router;
