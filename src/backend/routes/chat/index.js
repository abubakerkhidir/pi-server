import { Router } from "express";
import { setPiManager } from "./stream/state.js";
import streamRoutes from "./stream/index.js";
import historyRoutes from "./history.js";
import fileRoutes from "./file.js";
import sessionRoutes from "./session.js";

const router = Router();

// Re-export setPiManager for backward compatibility
export { setPiManager };

// Mount sub-routers
router.use(streamRoutes);
router.use(historyRoutes);
router.use(fileRoutes);
router.use(sessionRoutes);

export default router;
