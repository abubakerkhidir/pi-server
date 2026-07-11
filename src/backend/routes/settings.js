import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { loadUserSettings, saveUserSettings, getDefaultSettings, discoverAllTools } from "../core/pi-session.js";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { getDb } from "../core/db.js";

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

/**
 * Validate a number field.
 */
function validateNumberField(field, value, opts) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < opts.min || n > opts.max) {
    return { valid: false, error: `${field} must be an integer ${opts.min}-${opts.max}` };
  }
  return { valid: true, value: n };
}

/**
 * Apply tools_enabled update.
 */
function applyToolsEnabledUpdate(current, updates) {
  if (updates.tools_enabled !== undefined) {
    if (!Array.isArray(updates.tools_enabled)) {
      return { error: "tools_enabled must be an array" };
    }
    current.tools_enabled = updates.tools_enabled;
  }
  return null;
}

/**
 * Apply boolean field updates.
 */
function applyBooleanUpdates(current, updates) {
  for (const field of BOOLEAN_FIELDS) {
    if (updates[field] !== undefined) {
      current[field] = !!updates[field];
    }
  }
}

/**
 * Apply number field updates.
 */
function applyNumberUpdates(current, updates) {
  for (const [field, opts] of Object.entries(NUMBER_FIELDS)) {
    if (updates[field] !== undefined) {
      const validation = validateNumberField(field, updates[field], opts);
      if (!validation.valid) {
        return { error: validation.error };
      }
      current[field] = validation.value;
    }
  }
  return null;
}

/**
 * Apply string field updates.
 */
function applyStringUpdates(current, updates) {
  if (updates.system_message !== undefined) {
    if (typeof updates.system_message !== "string") {
      return { error: "system_message must be a string" };
    }
    current.system_message = updates.system_message;
  }

  if (updates.model_id !== undefined) {
    if (typeof updates.model_id !== "string") {
      return { error: "model_id must be a string" };
    }
    current.model_id = updates.model_id;
  }

  return null;
}

/**
 * Apply home_dir update.
 */
function applyHomeDirUpdate(current, updates, db, userId) {
  if (updates.home_dir !== undefined) {
    if (typeof updates.home_dir !== "string" || !updates.home_dir.trim()) {
      return { error: "home_dir must be a non-empty string" };
    }
    current.home_dir = updates.home_dir.trim();
    db.prepare("UPDATE users SET home_dir = ? WHERE id = ?").run(current.home_dir, userId);
  }
  return null;
}

/**
 * Group tools by source.
 */
function groupToolsBySource(tools) {
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

/**
 * Get group label for a tool source.
 */
function getGroupLabel(source) {
  if (source === "builtin") return "Built-in";
  if (source === "auto") return "Auto";
  if (source.startsWith("npm:")) return source.slice(4);
  return source;
}

/**
 * Get fallback tools when discovery fails.
 */
function getFallbackTools() {
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
 * Group models by provider.
 */
function groupModelsByProvider(models) {
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

  return Array.from(providers.entries()).map(([provider, models]) => ({
    provider,
    models,
  }));
}

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

  const toolsError = applyToolsEnabledUpdate(current, updates);
  if (toolsError) return res.status(400).json(toolsError);

  applyBooleanUpdates(current, updates);

  const numberError = applyNumberUpdates(current, updates);
  if (numberError) return res.status(400).json(numberError);

  const stringError = applyStringUpdates(current, updates);
  if (stringError) return res.status(400).json(stringError);

  const homeDirError = applyHomeDirUpdate(current, updates, db, req.user.userId);
  if (homeDirError) return res.status(400).json(homeDirError);

  saveUserSettings(db, req.user.userId, current);
  res.json(current);
});

router.get("/tools", authMiddleware, async (req, res) => {
  try {
    const allTools = await discoverAllTools(process.cwd());
    const groups = groupToolsBySource(allTools);
    res.json({ groups });
  } catch (err) {
    console.error("Tool discovery failed:", err.message);
    const fallback = getFallbackTools();
    res.json({
      groups: [{ name: "Built-in", source: "builtin", tools: fallback }],
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

    const groups = groupModelsByProvider(models);
    res.json({ groups });
  } catch (err) {
    console.error("Model discovery failed:", err.message);
    res.json({ groups: [] });
  }
});

export default router;
