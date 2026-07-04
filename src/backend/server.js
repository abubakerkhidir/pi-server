import express from "express";
import cors from "cors";
import path from "path";
import { initDb, closeDb } from "./db.js";
import { PiSessionManager } from "./pi-session.js";
import authRoutes from "./auth.js";
import chatRoutes, { setPiManager } from "./routes/chat.js";
import settingsRoutes from "./routes/settings.js";
import sessionsRoutes from "./routes/sessions.js";

const PORT = process.env.PORT || 3500;
const app = express();

app.use(cors());
app.use(express.json({ limit: "100mb" }));

// Serve React frontend build
app.use(express.static(path.join(process.cwd(), "dist")));

initDb();

const piManager = new PiSessionManager(process.cwd());
setPiManager(piManager);

app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);
app.use("/api", settingsRoutes);
app.use("/api", sessionsRoutes);

// Client-side routing: serve index.html for non-API, non-upload paths
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/uploads")) {
    res.sendFile(path.join(process.cwd(), "dist", "index.html"));
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", port: PORT });
});

const server = app.listen(PORT, () => {
  console.log(`\npi-server running at http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await piManager.dispose();
  closeDb();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  await piManager.dispose();
  closeDb();
  server.close(() => process.exit(0));
});
