import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { authPlugin } from "./middleware/auth.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { uploadRoutes } from "./routes/uploads.js";
import { reconstructionRoutes } from "./routes/reconstruction.js";
import { variationRoutes } from "./routes/variations.js";
import { assetRoutes } from "./routes/assets.js";

const app = Fastify({ logger: true });

// Health check (no auth)
app.get("/health", async () => ({ status: "ok" }));

// Global plugins
await app.register(cors, { origin: true });

// Auth
await app.register(authPlugin);

// Routes
await app.register(workspaceRoutes);
await app.register(uploadRoutes);
await app.register(reconstructionRoutes);
await app.register(variationRoutes);
await app.register(assetRoutes);

// Graceful shutdown
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  });
}

// Start
try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Server listening on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
