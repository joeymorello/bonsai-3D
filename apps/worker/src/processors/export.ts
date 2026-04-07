import type { Job } from "bullmq";
import { downloadFromS3, uploadToS3 } from "../lib/storage.js";

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

export async function processExport(job: Job): Promise<void> {
  const data = job.data as ExportJobData;
  const { workspaceId, variationId, format, editOperations } = data;

  try {
    await job.updateProgress(10);
    await job.log("[export] Loading base model...");

    // Load the base model from S3
    const baseModelKey = `workspaces/${workspaceId}/models/original.glb`;
    const modelBytes = await downloadFromS3(baseModelKey);

    await job.updateProgress(30);
    await job.log("[export] Base model loaded");

    // Load skeleton data
    const skeletonKey = `workspaces/${workspaceId}/models/skeleton.json`;
    let skeleton: unknown = null;
    try {
      const skeletonBuffer = await downloadFromS3(skeletonKey);
      skeleton = JSON.parse(skeletonBuffer.toString("utf-8"));
      await job.log("[export] Skeleton data loaded");
    } catch {
      await job.log("[export] No skeleton data found — skipping deformation");
    }

    await job.updateProgress(40);

    // Apply edit operations to the model
    await job.log(
      `[export] Applying ${editOperations.length} edit operations...`,
    );

    // TODO: Apply deformation operations using skeleton service
    // For v1, just copy the base model as the export (full deformation comes later)
    let processedModel: Uint8Array = modelBytes;
    if (editOperations.length > 0 && skeleton) {
      await job.log(
        "[export] Skeleton deformation not yet implemented — using base model",
      );
    }

    await job.updateProgress(70);
    await job.log("[export] Edit operations applied");

    // Convert to requested format if needed
    let outputBuffer: Uint8Array = processedModel;
    let contentType = "model/gltf-binary";
    let fileExtension = "glb";

    switch (format) {
      case "glb":
        // Already in GLB format
        break;
      case "obj":
        // TODO: Convert GLB to OBJ
        contentType = "text/plain";
        fileExtension = "obj";
        await job.log("[export] OBJ conversion not yet implemented — exporting as GLB");
        break;
      case "usdz":
        // TODO: Convert GLB to USDZ
        contentType = "model/vnd.usdz+zip";
        fileExtension = "usdz";
        await job.log("[export] USDZ conversion not yet implemented — exporting as GLB");
        break;
    }

    await job.updateProgress(85);

    // Upload exported model to S3
    const exportKey = `workspaces/${workspaceId}/exports/${variationId}.${fileExtension}`;
    await uploadToS3(exportKey, outputBuffer, contentType);

    // TODO: Update variation with snapshot asset ID in DB

    await job.updateProgress(100);
    await job.log(`[export] Export complete: ${exportKey}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Export failed: ${message}`);
    throw err;
  }
}
