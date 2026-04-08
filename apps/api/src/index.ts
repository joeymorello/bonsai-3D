import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import type { JwtPayload } from "./middleware/auth.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import { uploadRoutes } from "./routes/uploads.js";
import { reconstructionRoutes } from "./routes/reconstruction.js";
import { variationRoutes } from "./routes/variations.js";
import { assetRoutes } from "./routes/assets.js";
import { authRoutes } from "./routes/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const app = Fastify({ logger: true });

// Health check (no auth)
app.get("/health", async () => ({ status: "ok" }));

// Global plugins
await app.register(cors, { origin: true, credentials: true });
await app.register(fastifyJwt, { secret: config.jwtSecret });

// Auth: decorate request and add hook directly (not encapsulated)
app.decorateRequest("userId", "");

const isDevMode = config.jwtSecret === "dev-secret-change-in-production";

// API path prefixes that require auth
const API_PREFIXES = ["/workspaces", "/variations", "/assets/"];

app.addHook("onRequest", async (request, reply) => {
  // Only require auth for API routes; skip for static assets, SPA routes, health, auth
  const url = request.url.split("?")[0]!;
  const isApiRoute = API_PREFIXES.some((p) => url.startsWith(p));
  if (
    !isApiRoute ||
    url === "/health" ||
    url.startsWith("/auth/")
  ) return;

  if (isDevMode) {
    const devUserId = request.headers["x-dev-user-id"] as string | undefined;
    if (devUserId) {
      request.userId = devUserId;
      return;
    }
  }

  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    request.userId = decoded.sub;
  } catch {
    await reply.status(401).send({ error: "Unauthorized" });
  }
});

// Routes
await app.register(authRoutes);
await app.register(workspaceRoutes);
await app.register(uploadRoutes);
await app.register(reconstructionRoutes);
await app.register(variationRoutes);
await app.register(assetRoutes);

// Serve frontend static files
const webDistPath = resolve(__dirname, "../../web/dist");
if (existsSync(webDistPath)) {
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    wildcard: false,
  });

  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler(async (request, reply) => {
    if (
      request.url.startsWith("/workspaces") ||
      request.url.startsWith("/variations") ||
      request.url.startsWith("/assets/") ||
      request.url.startsWith("/auth/")
    ) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

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
