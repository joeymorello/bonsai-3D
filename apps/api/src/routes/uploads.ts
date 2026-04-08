import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import multipart from "@fastify/multipart";
import { db } from "../db/index.js";
import { uploadPhotos, treeWorkspaces } from "../db/schema.js";
import { uploadBuffer, presignDownload } from "../services/storage.js";

const WorkspaceIdParam = z.object({ id: z.string().uuid() });

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

  // Direct file upload — accepts multipart form data, stores in S3 server-side
  app.post<{ Params: { id: string } }>(
    "/workspaces/:id/uploads",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);

      // Verify workspace exists
      const [ws] = await db
        .select({ id: treeWorkspaces.id })
        .from(treeWorkspaces)
        .where(eq(treeWorkspaces.id, workspaceId));
      if (!ws) return reply.status(404).send({ error: "Workspace not found" });

      const parts = request.files();
      const uploaded: Array<Record<string, unknown>> = [];

      for await (const part of parts) {
        const ext = part.filename.split(".").pop() ?? "jpg";
        const key = `uploads/${workspaceId}/${randomUUID()}.${ext}`;
        const buf = await part.toBuffer();

        await uploadBuffer(key, buf, part.mimetype);

        const [photo] = await db
          .insert(uploadPhotos)
          .values({
            workspaceId,
            storageKey: key,
            cameraAngleHint: null,
            width: null,
            height: null,
            exif: null,
            qualityScore: null,
          })
          .returning();

        uploaded.push(photo!);
      }

      return reply.status(201).send(uploaded);
    },
  );

  // List photos for workspace (with presigned URLs)
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/photos",
    async (request) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);
      const photos = await db
        .select()
        .from(uploadPhotos)
        .where(eq(uploadPhotos.workspaceId, workspaceId));

      return Promise.all(
        photos.map(async (photo) => ({
          ...photo,
          url: await presignDownload(photo.storageKey),
        })),
      );
    },
  );
}
