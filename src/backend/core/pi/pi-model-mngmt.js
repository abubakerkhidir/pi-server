import { SessionManager, createAgentSession, } from "@earendil-works/pi-coding-agent";
import { error } from "../../utils/logger.js";

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
      thinkLevels:m.thinkingLevelMap?Object.keys(m.thinkingLevelMap):[]
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

async function getPiRawModels() {
  const sm = SessionManager.inMemory();
  const { session } = await createAgentSession({ sessionManager: sm, cwd: process.cwd() });
  const models = session.modelRegistry.getAvailable();
  session.dispose();
  return models;
}

export async function getPiDefaultSettings() {
  try {
    const sm = SessionManager.inMemory();
    const { session } = await createAgentSession({sessionManager: sm,cwd: process.cwd()});
    const s = {model: session.model.id,provider:session.model.provider||'llama.cpp', think_level:session.thinkingLevel||'medium'};
    tmp.dispose();
    return s;
  } catch (err){
    error('error in getPiDefaultSettings: ',err)
    return undefined;
  }
}