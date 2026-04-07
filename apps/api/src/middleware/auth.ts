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

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health check
    if (request.url === "/health") return;

    try {
      const decoded = await request.jwtVerify<JwtPayload>();
      request.userId = decoded.sub;
    } catch {
      await reply.status(401).send({ error: "Unauthorized" });
    }
  });
}
