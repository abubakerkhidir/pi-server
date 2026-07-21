import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { initDb, closeDb } from "../core/db/db.js";
import authRoutes from "../routes/auth.js";
import settingsRoutes from "../routes/settings.js";
import sessionsRoutes from "../routes/sessions.js";
import sessionRoutes from "../routes/session.js";
import fileRoutes from "../routes/file.js";
import hisRoutes from "../routes/history.js";
import chatRoutes from "../routes/chat-routes.js";
import { setPiManager } from "../core/chat/state.js";
import { PiSessionManager } from "../core/pi/pi-session-manager.js";
import { initCompactionAtts } from "../core/pi/pi-session-utils.js";

const PORT = process.env.PORT || 3500;

/**
 * Create and configure the Express app.
 */
function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "100mb" }));

  // Serve React frontend build
  app.use(express.static(path.join(process.cwd(), "dist")));

  return app;
}

/**
 * Mount all API routes.
 */
function mountRoutes(app) {
  app.use("/api/auth", authRoutes);
  app.use("/api", chatRoutes);
  app.use("/api", sessionRoutes);
  app.use("/api", fileRoutes);
  app.use("/api", hisRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", sessionsRoutes);
}

/**
 * Setup client-side routing (serve index.html for non-API paths).
 */
function setupClientRouting(app) {
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });
}

/**
 * Add health check endpoint.
 */
function addHealthCheck(app) {
  app.get("/health", (req, res) => {
    res.json({ status: "ok", port: PORT });
  });
}

/**
 * Graceful shutdown handler.
 */
function setupGracefulShutdown(server, piManager) {
  const shutdown = async () => {
    console.log("\nShutting down...");
    await piManager.dispose();
    closeDb();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

//init compact settings hack
initCompactionAtts()

// Initialize database
initDb();

// Create and configure app
const app = createApp();
mountRoutes(app);
setupClientRouting(app);
addHealthCheck(app);

// Initialize pi session manager
const piManager = new PiSessionManager(process.cwd());
setPiManager(piManager);

// Start server
const server = app.listen(PORT, () => {
  console.log(`\npi-server running at http://localhost:${PORT}`);
});

// Setup graceful shutdown
setupGracefulShutdown(server, piManager);
