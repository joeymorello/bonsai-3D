import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const AuthBody = z.object({
  email: z.string().email(),
});

export async function authRoutes(app: FastifyInstance) {
  // Register — create user with email, return JWT
  app.post("/auth/register", async (request, reply) => {
    const { email } = AuthBody.parse(request.body);

    // Check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      return reply.status(409).send({ error: "User already exists" });
    }

    const [user] = await db
      .insert(users)
      .values({ email })
      .returning();

    const token = await reply.jwtSign(
      { sub: user!.id, email: user!.email },
      { expiresIn: "7d" },
    );

    return reply.status(201).send({ user, token });
  });

  // Login — find user by email, return JWT
  app.post("/auth/login", async (request, reply) => {
    const { email } = AuthBody.parse(request.body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const token = await reply.jwtSign(
      { sub: user.id, email: user.email },
      { expiresIn: "7d" },
    );

    return reply.send({ user, token });
  });
}
