import { readFile } from "node:fs/promises";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import {
  qualityCheck,
  preprocess,
  cleanupMesh,
  extractSkeleton,
} from "../lib/recon-service.js";
import { uploadToS3, getPresignedUrl } from "../lib/storage.js";
import { db } from "../lib/db.js";
import {
  treeWorkspaces,
  modelAssets,
  reconstructionJobs,
  branchNodes,
  styleVariations,
} from "../lib/schema.js";

const MESHY_API_KEY = process.env.MESHY_API_KEY ?? "";
const MESHY_API_URL = "https://api.meshy.ai/v2";

interface ReconstructionJobData {
  workspaceId: string;
  jobId: string;
  imageUrls: string[];
  provider: string;
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
  const { workspaceId, imageUrls } = data;

  try {
    // Stage 1: Photo quality assessment
    await updateProgress(job, "photo_qa", "Checking photo quality...");
    const qaResponse = await qualityCheck(imageUrls);

    const accepted = qaResponse.results.filter((r) => r.is_accepted);
    const rejected = qaResponse.results.filter((r) => !r.is_accepted);
    await job.log(
      `[photo_qa] ${accepted.length} accepted, ${rejected.length} rejected`,
    );

    // Use accepted images if any, otherwise fall back to all (lenient dev mode)
    const usableUrls =
      accepted.length > 0
        ? accepted.map((r) => r.image_url)
        : qaResponse.results.map((r) => r.image_url);

    if (accepted.length === 0) {
      await job.log(
        "[photo_qa] No images passed strict QA — using all images (dev mode)",
      );
    }

    // Stage 2: Preprocess images
    await updateProgress(job, "preprocess_images", "Preprocessing images...");
    const preprocessed = await preprocess(usableUrls);
    await job.log(
      `[preprocess_images] ${preprocessed.processed_urls.length} images preprocessed`,
    );

    // Stage 3: Submit to reconstruction provider
    await updateProgress(
      job,
      "submit_reconstruction",
      "Submitting to reconstruction service...",
    );

    let s3Key: string;

    if (!MESHY_API_KEY || MESHY_API_KEY === "placeholder") {
      // DEV MODE: Generate a placeholder bonsai mesh via Python service
      await job.log(
        "[submit_reconstruction] No Meshy API key — generating placeholder mesh",
      );

      // Use the Python service to create a sample mesh from the uploaded images
      // We'll create a simple procedural bonsai shape
      const RECON_URL = process.env.RECON_SERVICE_URL ?? "http://localhost:8000";
      const genRes = await fetch(`${RECON_URL}/generate-placeholder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      if (genRes.ok) {
        const genResult = (await genRes.json()) as { mesh_path: string };
        const meshBytes = await readFile(genResult.mesh_path);
        s3Key = `workspaces/${workspaceId}/models/original.glb`;
        await uploadToS3(s3Key, meshBytes, "model/gltf-binary");
        await job.log(`[submit_reconstruction] Placeholder mesh stored at ${s3Key}`);
      } else {
        // Fallback: create a minimal GLB from scratch won't work easily,
        // so let's skip to a simple approach using trimesh via cleanup
        await job.log(
          "[submit_reconstruction] Placeholder generation failed — creating minimal mesh",
        );
        // Create a very simple mesh via the Python service's cleanup endpoint
        // We'll generate one from scratch and upload it
        const minimalRes = await fetch(`${RECON_URL}/generate-placeholder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: workspaceId }),
        }).catch(() => null);

        if (!minimalRes?.ok) {
          throw new Error("Cannot generate placeholder mesh and no Meshy API key configured");
        }
        const minResult = (await minimalRes.json()) as { mesh_path: string };
        const meshBytes = await readFile(minResult.mesh_path);
        s3Key = `workspaces/${workspaceId}/models/original.glb`;
        await uploadToS3(s3Key, meshBytes, "model/gltf-binary");
      }

      await updateProgress(job, "poll_reconstruction", "Skipped (dev mode)");
      await updateProgress(job, "download_result", "Skipped (dev mode)");
    } else {
      // PRODUCTION: Use Meshy API
      const meshyJob = (await callMeshyApi("POST", "/image-to-3d", {
        image_urls: preprocessed.processed_urls,
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
      let meshyResult: { model_urls: { glb: string; obj: string } } | null = null;
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

      s3Key = `workspaces/${workspaceId}/models/original.glb`;
      await uploadToS3(s3Key, glbBuffer, "model/gltf-binary");
    }

    // Stage 6: Cleanup geometry
    await updateProgress(
      job,
      "cleanup_geometry",
      "Cleaning up mesh geometry...",
    );
    // Python service needs a downloadable URL
    const meshUrl = await getPresignedUrl(s3Key);
    const cleaned = await cleanupMesh(meshUrl);
    await job.log(
      `[cleanup_geometry] Cleaned: ${cleaned.vertex_count} verts, ${cleaned.face_count} faces`,
    );

    // The cleanup service returns a local file path — read it and upload to S3
    const cleanedBytes = await readFile(cleaned.cleaned_mesh_url);
    const cleanedS3Key = `workspaces/${workspaceId}/models/cleaned.glb`;
    await uploadToS3(cleanedS3Key, cleanedBytes, "model/gltf-binary");

    // Stage 7: Extract skeleton
    await updateProgress(
      job,
      "extract_skeleton",
      "Extracting branch skeleton...",
    );
    // Pass the local file path to skeleton extraction (same machine)
    const skeleton = await extractSkeleton(cleaned.cleaned_mesh_url);

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
        storageKey: cleanedS3Key,
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
      nodes: Record<
        string,
        {
          id: string;
          position: [number, number, number];
          radius: number;
          parent_id: string | null;
          is_tip: boolean;
        }
      >;
      edges: Record<
        string,
        {
          source_id: string;
          target_id: string;
          curve_points: Array<[number, number, number]>;
          radii: number[];
          length: number;
        }
      >;
      root_id: string;
    };

    if (skeletonData.edges) {
      for (const [edgeId, edge] of Object.entries(skeletonData.edges)) {
        const sourceNode = skeletonData.nodes[edge.source_id];
        await db.insert(branchNodes).values({
          workspaceId,
          parentId: null, // skeleton node IDs are not UUIDs; parent linkage is in curveData
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

    // Create default "Original" variation
    await db
      .insert(styleVariations)
      .values({
        workspaceId,
        name: "Original",
        basedOnModelAssetId: meshAsset!.id,
      });

    await job.log(
      `[publish_workspace] Workspace ${workspaceId} published — mesh: ${meshAsset!.id}, skeleton: ${skeletonAsset!.id}`,
    );

    // Stage 9: Generate thumbnails (placeholder — requires headless GL)
    await updateProgress(
      job,
      "generate_thumbnails",
      "Generating preview thumbnails...",
    );
    await job.log(
      `[generate_thumbnails] Thumbnail generation deferred (requires headless renderer)`,
    );

    await job.updateProgress(100);
    await job.log("Reconstruction pipeline completed successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`[ERROR] Reconstruction failed: ${message}`);

    // Update workspace status to failed
    await db
      .update(treeWorkspaces)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(treeWorkspaces.id, workspaceId))
      .catch(() => {});

    // Update job status to failed
    await db
      .update(reconstructionJobs)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(reconstructionJobs.id, data.jobId))
      .catch(() => {});

    throw err;
  }
}
