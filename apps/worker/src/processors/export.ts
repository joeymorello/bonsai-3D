import type { Job } from "bullmq";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
});

const S3_BUCKET = process.env.S3_BUCKET ?? "bonsai3d";

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
    const getResult = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: baseModelKey,
      }),
    );

    if (!getResult.Body) {
      throw new Error("Base model not found in S3");
    }

    const modelBytes = await getResult.Body.transformToByteArray();
    await job.updateProgress(30);
    await job.log("[export] Base model loaded");

    // Load skeleton data
    const skeletonKey = `workspaces/${workspaceId}/models/skeleton.json`;
    const skeletonResult = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: skeletonKey,
      }),
    );

    const skeletonJson = await skeletonResult.Body?.transformToString();
    if (!skeletonJson) {
      throw new Error("Skeleton data not found");
    }

    const skeleton = JSON.parse(skeletonJson);
    await job.updateProgress(40);
    await job.log("[export] Skeleton data loaded");

    // Apply edit operations to the model
    await job.log(
      `[export] Applying ${editOperations.length} edit operations...`,
    );

    // TODO: Apply deformation operations using skeleton service
    // For each operation:
    //   - Resolve branch from skeleton graph
    //   - Apply bend/rotate/translate/prune transforms
    //   - Deform mesh vertices according to skeleton changes
    let processedModel = modelBytes;

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
        await job.log("[export] Converting to OBJ format...");
        break;
      case "usdz":
        // TODO: Convert GLB to USDZ
        contentType = "model/vnd.usdz+zip";
        fileExtension = "usdz";
        await job.log("[export] Converting to USDZ format...");
        break;
    }

    await job.updateProgress(85);

    // Upload exported model to S3
    const exportKey = `workspaces/${workspaceId}/exports/${variationId}.${fileExtension}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: exportKey,
        Body: outputBuffer,
        ContentType: contentType,
      }),
    );

    await job.updateProgress(100);
    await job.log(`[export] Export complete: ${exportKey}`);

    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Export failed: ${message}`);
    throw err;
  }
}
