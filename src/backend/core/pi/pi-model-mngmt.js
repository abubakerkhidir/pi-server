import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";

const EXTENDED_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

/**
 * Compute which thinking levels are available for a given model.
 */
export function computeThinkingLevels(model) {
  if (!model?.reasoning) return ["off"];
  return EXTENDED_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh") return mapped !== undefined;
    return true;
  });
}

/**
 * Find a fallback thinking level: prefer exact match, then next lower available.
 */
export function findFallbackLevel(defaultLevel, availableLevels) {
  if (!availableLevels.length) return "off";
  if (availableLevels.includes(defaultLevel)) return defaultLevel;

  // Find next lower level
  for (let i = EXTENDED_THINKING_LEVELS.indexOf(defaultLevel); i >= 0; i--) {
    const candidate = EXTENDED_THINKING_LEVELS[i];
    if (availableLevels.includes(candidate)) return candidate;
  }
  // Fallback to last available
  return availableLevels[availableLevels.length - 1];
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
    models: models.map((m) => ({
      ...m,
      provider,
    })),
  }));
}

export async function getPiModelsGrouped() {
  let modelsGrouped = { groups: [] };
  try {
    const models = await getPiRawModels();
    const groups = groupModelsByProvider(models);
    modelsGrouped = { groups };
  } catch (err) {
    console.error("Model discovery failed:", err.message);
  }
  return modelsGrouped;
}

/**
 * Get the full model info from the registry by provider and id.
 * Returns null if not found.
 */
export async function getPiModelById(provider, modelId) {
  try {
    const sm = SessionManager.inMemory();
    const { session: tmp } = await createAgentSession({
      sessionManager: sm,
      cwd: process.cwd(),
    });
    const model = tmp.modelRegistry.find(provider, modelId);
    tmp.dispose();
    return model || null;
  } catch {
    return null;
  }
}

/**
 * Get available thinking levels for a given model.
 */
export async function getPiModelThinkingLevels(provider, modelId) {
  const model = await getPiModelById(provider, modelId);
  if (!model) return [];
  return computeThinkingLevels(model);
}

/**
 * Set model on a session and optionally set think level.
 * If new model has fewer levels than current, adjust to next lower available.
 * Returns: { model, availableLevels, currentLevel }
 */
export async function setModelOnSession(session, provider, modelId, currentThinkLevel, availableLevels) {
  const model = session.modelRegistry.find(provider, modelId);
  if (!model) throw new Error(`Model ${provider}/${modelId} not found`);

  await session.setModel(model);

  const newLevels = computeThinkingLevels(model);

  // Adjust think level if current is not available
  let effectiveLevel = currentThinkLevel;
  if (effectiveLevel && !newLevels.includes(effectiveLevel)) {
    effectiveLevel = findFallbackLevel(effectiveLevel, newLevels);
  }
  if (!effectiveLevel || effectiveLevel === "off" && newLevels.length > 0) {
    effectiveLevel = newLevels[0] || "off";
  }

  return { model, availableLevels: newLevels, currentLevel: effectiveLevel };
}

async function getPiRawModels() {
  const sm = SessionManager.inMemory();
  const { session } = await createAgentSession({ sessionManager: sm, cwd: process.cwd() });
  const models = session.modelRegistry.getAvailable();
  session.dispose();
  return models;
}
