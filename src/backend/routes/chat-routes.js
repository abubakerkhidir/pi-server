import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { handleChatStream } from "../core/chat/chat-stream-handler.js";
import { getPiManager } from "../core/chat/state.js";
import { getPiModelById, computeThinkingLevels } from "../core/pi/pi-model-mngmt.js";

const router = Router();

router.post("/chat/stream", authMiddleware, upload.array("files", 20), handleChatStream);

router.get("/chat/commands", authMiddleware, (req, res) => {
  const { sessionId } = req.query;
  const piManager = getPiManager();
  try {
    const commands = piManager.getCommands(sessionId);
    res.json({ commands });
  } catch {
    res.json({ commands: [] });
  }
});

// Get available/current thinking levels for a session (or model-only)
router.get("/chat/thinking", authMiddleware, async (req, res) => {
  const { sessionId, modelId, modelProvider } = req.query;
  const piManager = getPiManager();

  let model = null;
  if (modelId && modelProvider) {
    model = await getPiModelById(modelProvider, modelId);
  }

  const info = piManager.getThinkingInfo(sessionId, model);
  res.json(info ?? { current: null, available: [] });
});

// Set thinking level on a session
router.post("/chat/thinking", authMiddleware, async (req, res) => {
  const { sessionId, level } = req.body;
  if (!sessionId || !level) return res.status(400).json({ error: "sessionId and level required" });
  const piManager = getPiManager();
  try {
    const effective = await piManager.setThinkingLevel(sessionId, level, req.user.userId);
    res.json({ level: effective });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Change model on a session
router.post("/chat/session-model", authMiddleware, async (req, res) => {
  const { sessionId, provider, modelId } = req.body;
  if (!sessionId || !provider || !modelId) {
    return res.status(400).json({ error: "sessionId, provider, and modelId required" });
  }
  const piManager = getPiManager();
  try {
    const result = await piManager.setModelOnSession(sessionId, provider, modelId, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
