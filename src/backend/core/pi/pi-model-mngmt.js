import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";

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

async function getPiRawModels() {
  const sm = SessionManager.inMemory();
  const { session } = await createAgentSession({ sessionManager: sm, cwd: process.cwd() });
  const models = session.modelRegistry.getAvailable();
  session.dispose();
  return models;
}
