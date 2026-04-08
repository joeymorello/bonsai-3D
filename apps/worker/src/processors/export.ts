import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { downloadFromS3, uploadToS3, getPresignedUrl } from "../lib/storage.js";
import { db } from "../lib/db.js";
import { modelAssets, styleVariations, branchNodes } from "../lib/schema.js";

interface ExportJobData {
  workspaceId: string;
  variationId: string;
  format: "glb" | "obj" | "usdz";
  editOperations: EditOperation[];
}

interface EditOperation {
  type: string;
  branchId: string;
  params: Record<string, unknown>;
}

const RECON_SERVICE_URL = process.env.RECON_SERVICE_URL ?? "http://localhost:8000";

export async function processExport(job: Job): Promise<void> {
  const data = job.data as ExportJobData;
  const { workspaceId, variationId, format, editOperations } = data;

  try {
    await job.updateProgress(10);
    await job.log("[export] Loading base model...");

    // Find the cleaned mesh asset from DB
    const meshAssets = await db
      .select()
      .from(modelAssets)
      .where(eq(modelAssets.workspaceId, workspaceId));
    const meshAsset = meshAssets.find((a) => a.kind === "cleaned_mesh") ?? meshAssets.find((a) => a.kind === "original_mesh");

    if (!meshAsset) throw new Error("No mesh asset found for workspace");

    const modelBytes = await downloadFromS3(meshAsset.storageKey);

    await job.updateProgress(30);
    await job.log("[export] Base model loaded");

    // Load skeleton data
    const skeletonAsset = meshAssets.find((a) => a.kind === "skeleton");
    let skeleton: unknown = null;
    if (skeletonAsset) {
      try {
        const skeletonBuffer = await downloadFromS3(skeletonAsset.storageKey);
        skeleton = JSON.parse(skeletonBuffer.toString("utf-8"));
        await job.log("[export] Skeleton data loaded");
      } catch {
        await job.log("[export] Failed to load skeleton — skipping deformation");
      }
    }

    await job.updateProgress(40);

    // Apply edit operations via the Python deformation service
    await job.log(
      `[export] Applying ${editOperations.length} edit operations...`,
    );

    let processedModel: Uint8Array = modelBytes;
    if (editOperations.length > 0 && skeleton) {
      try {
        // Upload base model to a temp key for the deformation service
        const tempKey = `workspaces/${workspaceId}/exports/_temp_base.glb`;
        await uploadToS3(tempKey, modelBytes, "model/gltf-binary");
        const tempUrl = await getPresignedUrl(tempKey);

        const deformRes = await fetch(`${RECON_SERVICE_URL}/deform`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mesh_url: tempUrl,
            skeleton,
            operations: editOperations,
          }),
        });

        if (deformRes.ok) {
          const result = (await deformRes.json()) as { deformed_s3_key: string };
          processedModel = await downloadFromS3(result.deformed_s3_key);
          await job.log("[export] Deformation applied successfully");
        } else {
          await job.log(
            `[export] Deformation service returned ${deformRes.status} — using base model`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await job.log(`[export] Deformation failed (${msg}) — using base model`);
      }
    }

    await job.updateProgress(70);
    await job.log("[export] Edit operations processed");

    // Convert to requested format if needed
    let outputBuffer: Uint8Array = processedModel;
    let contentType = "model/gltf-binary";
    let fileExtension = "glb";

    switch (format) {
      case "glb":
        break;
      case "obj":
        contentType = "text/plain";
        fileExtension = "obj";
        await job.log("[export] OBJ conversion not yet implemented — exporting as GLB");
        break;
      case "usdz":
        contentType = "model/vnd.usdz+zip";
        fileExtension = "usdz";
        await job.log("[export] USDZ conversion not yet implemented — exporting as GLB");
        break;
    }

    await job.updateProgress(85);

    // Upload exported model to S3
    const exportKey = `workspaces/${workspaceId}/exports/${variationId}.${fileExtension}`;
    await uploadToS3(exportKey, outputBuffer, contentType);

    // Create asset record and link to variation
    const [exportAsset] = await db
      .insert(modelAssets)
      .values({
        workspaceId,
        kind: "preview_glb",
        storageKey: exportKey,
        format: fileExtension,
      })
      .returning();

    await db
      .update(styleVariations)
      .set({ snapshotAssetId: exportAsset!.id })
      .where(eq(styleVariations.id, variationId));

    await job.updateProgress(100);
    await job.log(`[export] Export complete: ${exportKey}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Export failed: ${message}`);
    throw err;
  }
}
