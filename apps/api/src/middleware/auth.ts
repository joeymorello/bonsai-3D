import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { config } from "../config.js";

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

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

export async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, { secret: config.jwtSecret });

  app.decorateRequest("userId", "");

  const isDevMode = config.jwtSecret === "dev-secret-change-in-production";

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check and auth routes
    if (request.url === "/health" || request.url.startsWith("/auth/")) return;

    // Dev bypass: allow x-dev-user-id header when using dev secret
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
}
