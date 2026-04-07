import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { uploadPhotos, treeWorkspaces } from "../db/schema.js";
import { presignUpload } from "../services/storage.js";

const WorkspaceIdParam = z.object({ id: z.string().uuid() });

const PresignBody = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

const CompleteUploadBody = z.object({
  storageKey: z.string().min(1),
  cameraAngleHint: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  exif: z.record(z.unknown()).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
});

export async function uploadRoutes(app: FastifyInstance) {
  // Generate presigned upload URL
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/uploads/presign",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      const body = PresignBody.parse(request.body);

      // Verify workspace ownership
      const [ws] = await db
        .select({ id: treeWorkspaces.id })
        .from(treeWorkspaces)
        .where(eq(treeWorkspaces.id, workspaceId));
      if (!ws) return reply.status(404).send({ error: "Workspace not found" });

      const ext = body.filename.split(".").pop() ?? "jpg";
      const key = `uploads/${workspaceId}/${randomUUID()}.${ext}`;
      const result = await presignUpload(key, body.contentType);

      return reply.status(200).send(result);
    },
  );

  // Record completed upload
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/uploads/complete",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      const body = CompleteUploadBody.parse(request.body);

      const [photo] = await db
        .insert(uploadPhotos)
        .values({
          workspaceId,
          storageKey: body.storageKey,
          cameraAngleHint: body.cameraAngleHint,
          width: body.width,
          height: body.height,
          exif: body.exif,
          qualityScore: body.qualityScore,
        })
        .returning();

      return reply.status(201).send(photo);
    },
  );

  // List photos for workspace
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/photos",
    async (request) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      return db
        .select()
        .from(uploadPhotos)
        .where(eq(uploadPhotos.workspaceId, workspaceId));
    },
  );
}
