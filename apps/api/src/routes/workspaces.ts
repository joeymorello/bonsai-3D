import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { treeWorkspaces } from "../db/schema.js";

const CreateWorkspaceBody = z.object({
  name: z.string().min(1).max(255),
  speciesGuess: z.string().optional(),
});

const UpdateWorkspaceBody = z.object({
  name: z.string().min(1).max(255).optional(),
  speciesGuess: z.string().optional(),
  status: z.enum(["draft", "uploading", "processing", "ready", "failed"]).optional(),
  coverImageUrl: z.string().url().optional(),
});

const IdParam = z.object({ id: z.string().uuid() });

export async function workspaceRoutes(app: FastifyInstance) {
  // Create workspace
  app.post("/workspaces", async (request, reply) => {
    const body = CreateWorkspaceBody.parse(request.body);
    const [workspace] = await db
      .insert(treeWorkspaces)
      .values({
        userId: request.userId,
        name: body.name,
        speciesGuess: body.speciesGuess,
      })
      .returning();
    return reply.status(201).send(workspace);
  });

  // List workspaces for current user
  app.get("/workspaces", async (request) => {
    const rows = await db
      .select()
      .from(treeWorkspaces)
      .where(eq(treeWorkspaces.userId, request.userId))
      .orderBy(treeWorkspaces.createdAt);
    return rows;
  });

  // Get single workspace
  app.get<{ Params: { id: string } }>("/workspaces/:id", async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const [workspace] = await db
      .select()
      .from(treeWorkspaces)
      .where(and(eq(treeWorkspaces.id, id), eq(treeWorkspaces.userId, request.userId)));
    if (!workspace) return reply.status(404).send({ error: "Not found" });
    return workspace;
  });

  // Update workspace
  app.patch<{ Params: { id: string } }>("/workspaces/:id", async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const body = UpdateWorkspaceBody.parse(request.body);
    const [updated] = await db
      .update(treeWorkspaces)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(treeWorkspaces.id, id), eq(treeWorkspaces.userId, request.userId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: "Not found" });
    return updated;
  });

  // Delete workspace
  app.delete<{ Params: { id: string } }>("/workspaces/:id", async (request, reply) => {
    const { id } = IdParam.parse(request.params);
    const [deleted] = await db
      .delete(treeWorkspaces)
      .where(and(eq(treeWorkspaces.id, id), eq(treeWorkspaces.userId, request.userId)))
      .returning();
    if (!deleted) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });
}
