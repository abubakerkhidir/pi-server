import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getGroupedTools } from "../core/pi/tool-cache.js";
import { loadUserSettings, saveUserSettings } from "../core/db/settings-dao.js";
import { getPiModelsGrouped } from "../core/pi/pi-model-mngmt.js";
import { updateHomeDir } from "../core/db/user-dao.js";

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
function applyHomeDirUpdate(current, updates, userId) {
  if (updates.home_dir !== undefined) {
    if (typeof updates.home_dir !== "string" || !updates.home_dir.trim()) {
      return { error: "home_dir must be a non-empty string" };
    }
    current.home_dir = updates.home_dir.trim();
    updateHomeDir(current.home_dir, userId);
  }
  return null;
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

router.get("/settings", authMiddleware, (req, res) => {
  const settings = loadUserSettings(req.user.userId);
  res.json(settings);
});

router.put("/settings", authMiddleware, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Invalid settings payload" });
  }

  const current = loadUserSettings(req.user.userId);

  const toolsError = applyToolsEnabledUpdate(current, updates);
  if (toolsError) return res.status(400).json(toolsError);

  applyBooleanUpdates(current, updates);

  const numberError = applyNumberUpdates(current, updates);
  if (numberError) return res.status(400).json(numberError);

  const stringError = applyStringUpdates(current, updates);
  if (stringError) return res.status(400).json(stringError);

  const homeDirError = applyHomeDirUpdate(current, updates, req.user.userId);
  if (homeDirError) return res.status(400).json(homeDirError);

  saveUserSettings(req.user.userId, current);
  res.json(current);
});

router.get("/tools", authMiddleware, async (req, res) => {
  const groupedTools = await getGroupedTools();
  res.json(groupedTools);
});

router.get("/models", authMiddleware, async (req, res) => {
  let modelsGrouped = await getPiModelsGrouped();
  res.json(modelsGrouped);
});


export default router;