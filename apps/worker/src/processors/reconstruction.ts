import type { Job } from "bullmq";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const RECON_PYTHON_URL =
  process.env.RECON_PYTHON_URL ?? "http://localhost:8000";
const MESHY_API_KEY = process.env.MESHY_API_KEY ?? "";
const MESHY_API_URL = "https://api.meshy.ai/v2";

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

async function callPython(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${RECON_PYTHON_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python service ${endpoint} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function updateProgress(job: Job, stage: Stage, message: string) {
  const stageIndex = STAGES.indexOf(stage);
  const progress = Math.round(((stageIndex + 1) / STAGES.length) * 100);
  await job.updateProgress(progress);
  await job.log(`[${stage}] ${message}`);
}

export async function processReconstruction(job: Job): Promise<void> {
  const data = job.data as ReconstructionJobData;
  const { workspaceId, photoUrls } = data;

  try {
    // Stage 1: Photo quality assessment
    await updateProgress(job, "photo_qa", "Checking photo quality...");
    const qaResult = (await callPython("/quality-check", {
      image_urls: photoUrls,
    })) as { scores: number[]; passed: boolean; issues: string[] };

    if (!qaResult.passed) {
      throw new Error(
        `Photo quality check failed: ${qaResult.issues.join(", ")}`,
      );
    }

    // Stage 2: Preprocess images
    await updateProgress(job, "preprocess_images", "Preprocessing images...");
    const preprocessed = (await callPython("/preprocess", {
      image_urls: photoUrls,
    })) as { processed_paths: string[] };

    // Segmentation pass
    const segmented = (await callPython("/segment", {
      image_urls: preprocessed.processed_paths,
    })) as { mask_paths: string[] };

    // Stage 3: Submit to reconstruction provider
    await updateProgress(
      job,
      "submit_reconstruction",
      "Submitting to reconstruction service...",
    );
    const meshyRes = await fetch(`${MESHY_API_URL}/image-to-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MESHY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_urls: preprocessed.processed_paths,
        mode: "refine",
        topology: "quad",
        target_polycount: 50000,
      }),
    });

    if (!meshyRes.ok) {
      throw new Error(`Meshy API submission failed: ${meshyRes.status}`);
    }

    const meshyJob = (await meshyRes.json()) as { result: string };
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
      const pollRes = await fetch(
        `${MESHY_API_URL}/image-to-3d/${meshyTaskId}`,
        {
          headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
        },
      );
      const pollData = (await pollRes.json()) as {
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
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: glbBuffer,
        ContentType: "model/gltf-binary",
      }),
    );

    // Stage 6: Cleanup geometry
    await updateProgress(
      job,
      "cleanup_geometry",
      "Cleaning up mesh geometry...",
    );
    const cleaned = (await callPython("/cleanup-mesh", {
      s3_key: s3Key,
      target_faces: 30000,
    })) as { cleaned_s3_key: string };

    // Stage 7: Extract skeleton
    await updateProgress(
      job,
      "extract_skeleton",
      "Extracting branch skeleton...",
    );
    const skeleton = (await callPython("/extract-skeleton", {
      s3_key: cleaned.cleaned_s3_key,
    })) as { skeleton: unknown };

    // Store skeleton data
    const skeletonKey = `workspaces/${workspaceId}/models/skeleton.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: skeletonKey,
        Body: JSON.stringify(skeleton.skeleton),
        ContentType: "application/json",
      }),
    );

    // Stage 8: Publish workspace
    await updateProgress(
      job,
      "publish_workspace",
      "Publishing workspace...",
    );
    // TODO: Update workspace status in database to 'ready'
    // TODO: Set original model asset reference
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
      `[generate_thumbnails] Thumbnail placeholder at ${thumbnailKey}`,
    );

    await job.updateProgress(100);
    await job.log("Reconstruction pipeline completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Reconstruction failed: ${message}`);
    throw err;
  }
}
