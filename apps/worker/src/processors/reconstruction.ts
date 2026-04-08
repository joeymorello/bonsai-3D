import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  qualityCheck,
  preprocess,
  segmentImages,
  cleanupMesh,
  extractSkeleton,
} from "../lib/recon-service.js";
import { uploadToS3 } from "../lib/storage.js";
import { db } from "../lib/db.js";
import {
  treeWorkspaces,
  modelAssets,
  reconstructionJobs,
  branchNodes,
} from "../lib/schema.js";

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

    // Stage 8: Publish workspace — persist assets and update status
    await updateProgress(
      job,
      "publish_workspace",
      "Publishing workspace...",
    );

    // Create model asset records
    const [meshAsset] = await db
      .insert(modelAssets)
      .values({
        workspaceId,
        kind: "cleaned_mesh",
        storageKey: cleaned.cleaned_s3_key,
        format: "glb",
      })
      .returning();

    const [skeletonAsset] = await db
      .insert(modelAssets)
      .values({
        workspaceId,
        kind: "skeleton",
        storageKey: skeletonKey,
        format: "json",
      })
      .returning();

    // Store original mesh asset too
    await db
      .insert(modelAssets)
      .values({
        workspaceId,
        kind: "original_mesh",
        storageKey: s3Key,
        format: "glb",
      });

    // Persist branch nodes from skeleton data
    const skeletonData = skeleton.skeleton as {
      nodes: Record<string, { id: string; position: [number, number, number]; radius: number; parent_id: string | null; is_tip: boolean }>;
      edges: Record<string, { source_id: string; target_id: string; curve_points: Array<[number, number, number]>; radii: number[]; length: number }>;
      root_id: string;
    };

    if (skeletonData.edges) {
      for (const [edgeId, edge] of Object.entries(skeletonData.edges)) {
        const sourceNode = skeletonData.nodes[edge.source_id];
        await db.insert(branchNodes).values({
          workspaceId,
          parentId: sourceNode?.parent_id ?? null,
          curveData: {
            edgeId,
            sourceId: edge.source_id,
            targetId: edge.target_id,
            curvePoints: edge.curve_points.map((p, i) => ({
              position: p,
              radius: edge.radii[i] ?? edge.radii[0] ?? 0.01,
            })),
            length: edge.length,
          },
          radius: edge.radii[0] ?? 0.01,
        });
      }
    }

    // Update workspace status to ready
    await db
      .update(treeWorkspaces)
      .set({
        status: "ready",
        originalModelAssetId: meshAsset!.id,
        updatedAt: new Date(),
      })
      .where(eq(treeWorkspaces.id, workspaceId));

    // Update reconstruction job status
    await db
      .update(reconstructionJobs)
      .set({
        status: "completed",
        step: "publish",
        finishedAt: new Date(),
      })
      .where(eq(reconstructionJobs.id, data.jobId));

    await job.log(
      `[publish_workspace] Workspace ${workspaceId} published — mesh: ${meshAsset!.id}, skeleton: ${skeletonAsset!.id}`,
    );

    // Stage 9: Generate thumbnails (placeholder — requires headless GL)
    await updateProgress(
      job,
      "generate_thumbnails",
      "Generating preview thumbnails...",
    );
    const thumbnailKey = `workspaces/${workspaceId}/thumbnails/preview.png`;
    await job.log(
      `[generate_thumbnails] Thumbnail generation deferred (requires headless renderer) — ${thumbnailKey}`,
    );

    await job.updateProgress(100);
    await job.log("Reconstruction pipeline completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Reconstruction failed: ${message}`);
    throw err;
  }
}
