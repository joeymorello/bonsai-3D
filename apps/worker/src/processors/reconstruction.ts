import type { Job } from "bullmq";
import {
  qualityCheck,
  preprocess,
  segmentImages,
  cleanupMesh,
  extractSkeleton,
} from "../lib/recon-service.js";
import { uploadToS3 } from "../lib/storage.js";

const MESHY_API_KEY = process.env.MESHY_API_KEY ?? "";
const MESHY_API_URL = "https://api.meshy.ai/v2";

interface ReconstructionJobData {
  workspaceId: string;
  jobId: string;
  photoUrls: string[];
  provider: "meshy" | "tripo" | "local";
}

type Stage =
  | "photo_qa"
  | "preprocess_images"
  | "submit_reconstruction"
  | "poll_reconstruction"
  | "download_result"
  | "cleanup_geometry"
  | "extract_skeleton"
  | "publish_workspace"
  | "generate_thumbnails";

const STAGES: Stage[] = [
  "photo_qa",
  "preprocess_images",
  "submit_reconstruction",
  "poll_reconstruction",
  "download_result",
  "cleanup_geometry",
  "extract_skeleton",
  "publish_workspace",
  "generate_thumbnails",
];

async function updateProgress(job: Job, stage: Stage, message: string) {
  const stageIndex = STAGES.indexOf(stage);
  const progress = Math.round(((stageIndex + 1) / STAGES.length) * 100);
  await job.updateProgress(progress);
  await job.log(`[${stage}] ${message}`);
}

async function callMeshyApi(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${MESHY_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meshy API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function processReconstruction(job: Job): Promise<void> {
  const data = job.data as ReconstructionJobData;
  const { workspaceId, photoUrls } = data;

  try {
    // Stage 1: Photo quality assessment
    await updateProgress(job, "photo_qa", "Checking photo quality...");
    const qaResult = await qualityCheck(photoUrls);

    if (!qaResult.passed) {
      throw new Error(
        `Photo quality check failed: ${qaResult.issues.join(", ")}`,
      );
    }

    // Stage 2: Preprocess images
    await updateProgress(job, "preprocess_images", "Preprocessing images...");
    const preprocessed = await preprocess(photoUrls);

    // Segmentation pass
    await segmentImages(preprocessed.processed_paths);

    // Stage 3: Submit to reconstruction provider
    await updateProgress(
      job,
      "submit_reconstruction",
      "Submitting to reconstruction service...",
    );

    if (!MESHY_API_KEY) {
      await job.log(
        "[submit_reconstruction] No MESHY_API_KEY set — skipping Meshy submission",
      );
      // In dev/test without an API key, skip the Meshy stages
      await updateProgress(
        job,
        "publish_workspace",
        "Skipping reconstruction (no API key) — publishing workspace...",
      );
      await job.log(
        `[publish_workspace] Workspace ${workspaceId} — no model generated (no API key)`,
      );
      await updateProgress(
        job,
        "generate_thumbnails",
        "Would generate thumbnails (placeholder)",
      );
      await job.log(
        `[generate_thumbnails] Thumbnail generation skipped (no model)`,
      );
      await job.updateProgress(100);
      return;
    }

    const meshyJob = (await callMeshyApi("POST", "/image-to-3d", {
      image_urls: preprocessed.processed_paths,
      mode: "refine",
      topology: "quad",
      target_polycount: 50000,
    })) as { result: string };

    const meshyTaskId = meshyJob.result;

    // Stage 4: Poll reconstruction
    await updateProgress(
      job,
      "poll_reconstruction",
      `Polling Meshy task ${meshyTaskId}...`,
    );
    let meshyStatus = "PENDING";
    let meshyResult: { model_urls: { glb: string; obj: string } } | null =
      null;
    const maxPolls = 120;
    let pollCount = 0;

    while (meshyStatus !== "SUCCEEDED" && pollCount < maxPolls) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      const pollData = (await callMeshyApi(
        "GET",
        `/image-to-3d/${meshyTaskId}`,
      )) as {
        status: string;
        model_urls?: { glb: string; obj: string };
        progress: number;
      };
      meshyStatus = pollData.status;

      if (meshyStatus === "FAILED") {
        throw new Error("Meshy reconstruction failed");
      }

      if (meshyStatus === "SUCCEEDED" && pollData.model_urls) {
        meshyResult = { model_urls: pollData.model_urls };
      }

      pollCount++;
      await job.log(
        `[poll_reconstruction] Poll ${pollCount}: ${meshyStatus} (${pollData.progress}%)`,
      );
    }

    if (!meshyResult) {
      throw new Error("Meshy reconstruction timed out");
    }

    // Stage 5: Download result and store in S3
    await updateProgress(
      job,
      "download_result",
      "Downloading reconstruction result...",
    );
    const glbRes = await fetch(meshyResult.model_urls.glb);
    const glbBuffer = Buffer.from(await glbRes.arrayBuffer());

    const s3Key = `workspaces/${workspaceId}/models/original.glb`;
    await uploadToS3(s3Key, glbBuffer, "model/gltf-binary");

    // Stage 6: Cleanup geometry
    await updateProgress(
      job,
      "cleanup_geometry",
      "Cleaning up mesh geometry...",
    );
    const cleaned = await cleanupMesh(s3Key);

    // Stage 7: Extract skeleton
    await updateProgress(
      job,
      "extract_skeleton",
      "Extracting branch skeleton...",
    );
    const skeleton = await extractSkeleton(cleaned.cleaned_s3_key);

    // Store skeleton data
    const skeletonKey = `workspaces/${workspaceId}/models/skeleton.json`;
    await uploadToS3(
      skeletonKey,
      JSON.stringify(skeleton.skeleton),
      "application/json",
    );

    // Stage 8: Publish workspace
    await updateProgress(
      job,
      "publish_workspace",
      "Publishing workspace...",
    );
    // TODO: Update workspace status in database to 'ready'
    // TODO: Set originalModelAssetId in DB
    await job.log(
      `[publish_workspace] Workspace ${workspaceId} model at ${cleaned.cleaned_s3_key}`,
    );

    // Stage 9: Generate thumbnails
    await updateProgress(
      job,
      "generate_thumbnails",
      "Generating preview thumbnails...",
    );
    // TODO: Render thumbnail images from 3D model
    const thumbnailKey = `workspaces/${workspaceId}/thumbnails/preview.png`;
    await job.log(
      `[generate_thumbnails] Would generate thumbnail at ${thumbnailKey} (placeholder)`,
    );

    await job.updateProgress(100);
    await job.log("Reconstruction pipeline completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Reconstruction failed: ${message}`);
    throw err;
  }
}
