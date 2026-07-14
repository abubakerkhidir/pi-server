import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import { handleChatStream } from "../core/chat/chat-stream-handler.js";

const router = Router();

router.post("/chat/stream", authMiddleware, upload.array("files", 20), handleChatStream);

export default router