import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { modelAssets, branchNodes, treeWorkspaces } from "../db/schema.js";
import { presignDownload } from "../services/storage.js";

const AssetIdParam = z.object({ id: z.string().uuid() });
const WorkspaceIdParam = z.object({ id: z.string().uuid() });

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

  // Get all assets for a workspace — used by the editor to load model + skeleton
  app.get<{ Params: { id: string } }>(
    "/workspaces/:id/assets",
    async (request, reply) => {
      const { id: workspaceId } = WorkspaceIdParam.parse(request.params);

      // Verify ownership
      const [ws] = await db
        .select({ id: treeWorkspaces.id })
        .from(treeWorkspaces)
        .where(
          and(eq(treeWorkspaces.id, workspaceId), eq(treeWorkspaces.userId, request.userId)),
        );
      if (!ws) return reply.status(404).send({ error: "Workspace not found" });

      const assets = await db
        .select()
        .from(modelAssets)
        .where(eq(modelAssets.workspaceId, workspaceId));

      // Build presigned URLs for key asset types
      const meshAsset = assets.find((a) => a.kind === "cleaned_mesh") ?? assets.find((a) => a.kind === "original_mesh");
      const skeletonAsset = assets.find((a) => a.kind === "skeleton");

      const meshUrl = meshAsset ? await presignDownload(meshAsset.storageKey) : null;
      const skeletonUrl = skeletonAsset ? await presignDownload(skeletonAsset.storageKey) : null;

      // Fetch branch nodes for this workspace
      const branches = await db
        .select()
        .from(branchNodes)
        .where(eq(branchNodes.workspaceId, workspaceId));

      return {
        assets,
        meshUrl,
        skeletonUrl,
        meshAssetId: meshAsset?.id ?? null,
        skeletonAssetId: skeletonAsset?.id ?? null,
        branches,
      };
    },
  );
}
