import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  styleVariations,
  editOperations,
  treeWorkspaces,
} from "../db/schema.js";
import { reconstructionQueue } from "../services/queue.js";

const WorkspaceIdParam = z.object({ id: z.string().uuid() });
const VariationIdParam = z.object({ id: z.string().uuid() });

const CreateVariationBody = z.object({
  name: z.string().min(1).max(255),
  basedOnModelAssetId: z.string().uuid().optional(),
});

const UpdateVariationBody = z.object({
  name: z.string().min(1).max(255).optional(),
  editScriptJson: z.unknown().optional(),
  thumbnailUrl: z.string().url().optional(),
});

const AddOperationBody = z.object({
  type: z.enum([
    "bend_branch",
    "rotate_branch",
    "translate_branch",
    "prune_segment",
    "hide_leaf_cluster",
  ]),
  payloadJson: z.unknown(),
});

export async function variationRoutes(app: FastifyInstance) {
  // Create variation
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/variations",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      const body = CreateVariationBody.parse(request.body);

      // Verify ownership
      const [ws] = await db
        .select({ id: treeWorkspaces.id })
        .from(treeWorkspaces)
        .where(
          and(eq(treeWorkspaces.id, workspaceId), eq(treeWorkspaces.userId, request.userId)),
        );
      if (!ws) return reply.status(404).send({ error: "Workspace not found" });

      const [variation] = await db
        .insert(styleVariations)
        .values({
          workspaceId,
          name: body.name,
          basedOnModelAssetId: body.basedOnModelAssetId,
        })
        .returning();

      return reply.status(201).send(variation);
    },
  );

  // List variations for workspace
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/variations",
    async (request) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      return db
        .select()
        .from(styleVariations)
        .where(eq(styleVariations.workspaceId, workspaceId))
        .orderBy(styleVariations.createdAt);
    },
  );

  // Get single variation
  app.get<{ Params: { id: string } }>("/variations/:id", async (request, reply) => {
    const { id } = VariationIdParam.parse(request.params);
    const [variation] = await db
      .select()
      .from(styleVariations)
      .where(eq(styleVariations.id, id));
    if (!variation) return reply.status(404).send({ error: "Not found" });
    return variation;
  });

  // Update variation
  app.patch<{ Params: { id: string } }>("/variations/:id", async (request, reply) => {
    const { id } = VariationIdParam.parse(request.params);
    const body = UpdateVariationBody.parse(request.body);
    const [updated] = await db
      .update(styleVariations)
      .set(body)
      .where(eq(styleVariations.id, id))
      .returning();
    if (!updated) return reply.status(404).send({ error: "Not found" });
    return updated;
  });

  // Delete variation
  app.delete<{ Params: { id: string } }>("/variations/:id", async (request, reply) => {
    const { id } = VariationIdParam.parse(request.params);
    const [deleted] = await db
      .delete(styleVariations)
      .where(eq(styleVariations.id, id))
      .returning();
    if (!deleted) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });

  // Add edit operation to variation
  app.post<{ Params: { id: string } }>(
    "/variations/:id/operations",
    async (request, reply) => {
      const { id: variationId } = VariationIdParam.parse(request.params);
      const body = AddOperationBody.parse(request.body);

      // Verify variation exists
      const [variation] = await db
        .select({ id: styleVariations.id })
        .from(styleVariations)
        .where(eq(styleVariations.id, variationId));
      if (!variation) return reply.status(404).send({ error: "Variation not found" });

      const [op] = await db
        .insert(editOperations)
        .values({
          variationId,
          type: body.type,
          payloadJson: body.payloadJson,
        })
        .returning();

      return reply.status(201).send(op);
    },
  );

  // Trigger export job for a variation
  app.post<{ Params: { id: string } }>(
    "/variations/:id/export",
    async (request, reply) => {
      const { id: variationId } = VariationIdParam.parse(request.params);

      const [variation] = await db
        .select()
        .from(styleVariations)
        .where(eq(styleVariations.id, variationId));
      if (!variation) return reply.status(404).send({ error: "Variation not found" });

      const job = await reconstructionQueue.add("export-variation", {
        variationId,
        workspaceId: variation.workspaceId,
      });

      return reply.status(202).send({ jobId: job.id, status: "queued" });
    },
  );
}
