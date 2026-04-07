import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { reconstructionJobs, uploadPhotos, treeWorkspaces } from "../db/schema.js";
import { enqueueReconstructionJob } from "../services/queue.js";
import { getObjectUrl } from "../services/storage.js";

const WorkspaceIdParam = z.object({ id: z.string().uuid() });

const ReconstructBody = z.object({
  provider: z.enum(["meshy", "hunyuan", "trellis", "photogrammetry"]).default("meshy"),
});

export async function reconstructionRoutes(app: FastifyInstance) {
  // Enqueue reconstruction job
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/reconstruct",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      const body = ReconstructBody.parse(request.body);

      // Verify ownership
      const [ws] = await db
        .select({ id: treeWorkspaces.id })
        .from(treeWorkspaces)
        .where(
          and(eq(treeWorkspaces.id, workspaceId), eq(treeWorkspaces.userId, request.userId)),
        );
      if (!ws) return reply.status(404).send({ error: "Workspace not found" });

      // Get accepted photos
      const photos = await db
        .select()
        .from(uploadPhotos)
        .where(eq(uploadPhotos.workspaceId, workspaceId));
      if (photos.length === 0) {
        return reply.status(400).send({ error: "No photos uploaded" });
      }

      // Create job record
      const [job] = await db
        .insert(reconstructionJobs)
        .values({
          workspaceId,
          provider: body.provider,
          status: "queued",
          step: "ingest",
          startedAt: new Date(),
        })
        .returning();

      // Build image URLs and enqueue
      const imageUrls = photos.map((p) => getObjectUrl(p.storageKey));
      await enqueueReconstructionJob({
        workspaceId,
        jobId: job!.id,
        provider: body.provider,
        imageUrls,
      });

      // Update workspace status
      await db
        .update(treeWorkspaces)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(treeWorkspaces.id, workspaceId));

      return reply.status(202).send(job);
    },
  );

  // Get reconstruction status
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/reconstruction-status",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);

      const jobs = await db
        .select()
        .from(reconstructionJobs)
        .where(eq(reconstructionJobs.workspaceId, workspaceId))
        .orderBy(reconstructionJobs.startedAt);

      if (jobs.length === 0) {
        return reply.status(404).send({ error: "No reconstruction jobs found" });
      }

      return { jobs, latest: jobs[jobs.length - 1] };
    },
  );
}
