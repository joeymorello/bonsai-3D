import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { modelAssets } from "../db/schema.js";
import { presignDownload } from "../services/storage.js";

const AssetIdParam = z.object({ id: z.string().uuid() });

export async function assetRoutes(app: FastifyInstance) {
  // Get asset manifest / metadata
  app.get<{ Params: { id: string } }>("/assets/:id/manifest", async (request, reply) => {
    const { id } = AssetIdParam.parse(request.params);
    const [asset] = await db
      .select()
      .from(modelAssets)
      .where(eq(modelAssets.id, id));
    if (!asset) return reply.status(404).send({ error: "Asset not found" });
    return asset;
  });

  // Get presigned download URL for asset
  app.get<{ Params: { id: string } }>(
    "/assets/:id/download-url",
    async (request, reply) => {
      const { id } = AssetIdParam.parse(request.params);
      const [asset] = await db
        .select()
        .from(modelAssets)
        .where(eq(modelAssets.id, id));
      if (!asset) return reply.status(404).send({ error: "Asset not found" });

      const url = await presignDownload(asset.storageKey);
      return { url, key: asset.storageKey, format: asset.format };
    },
  );
}
