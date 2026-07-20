import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { handleChatStream } from "../core/chat/chat-stream-handler.js";
import { getPiManager } from "../core/chat/state.js";

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

router.get("/chat/thinking", authMiddleware, (req, res) => {
  const { sessionId } = req.query;
  const piManager = getPiManager();
  const info = piManager.getThinkingInfo(sessionId);
  res.json(info ?? { current: null, available: [] });
});

router.post("/chat/thinking", authMiddleware, (req, res) => {
  const { sessionId, level } = req.body;
  if (!sessionId || !level) return res.status(400).json({ error: "sessionId and level required" });
  const piManager = getPiManager();
  try {
    const effective = piManager.setThinkingLevel(sessionId, level);
    res.json({ level: effective });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

export default router