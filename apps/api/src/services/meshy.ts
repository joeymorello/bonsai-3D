import { config } from "../config.js";

const BASE_URL = "https://api.meshy.ai/openapi/v2";

export interface MeshyTaskStatus {
  id: string;
  status: "pending" | "in_progress" | "succeeded" | "failed" | "expired";
  progress: number;
  model_urls?: {
    glb?: string;
    obj?: string;
    fbx?: string;
  };
  thumbnail_url?: string;
  created_at: string;
  finished_at?: string;
  task_error?: { message: string };
}

async function meshyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.meshyApiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meshy API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export async function createMultiImageTask(imageUrls: string[]): Promise<string> {
  const result = await meshyFetch<{ result: string }>("/image-to-3d", {
    method: "POST",
    body: JSON.stringify({
      image_url: imageUrls[0],
      enable_pbr: true,
      should_remesh: true,
    }),
  });
  return result.result;
}

export async function getTaskStatus(taskId: string): Promise<MeshyTaskStatus> {
  return meshyFetch<MeshyTaskStatus>(`/image-to-3d/${taskId}`);
}

export async function downloadResult(taskId: string): Promise<Buffer> {
  const status = await getTaskStatus(taskId);
  const glbUrl = status.model_urls?.glb;
  if (!glbUrl) {
    throw new Error(`No GLB model available for task ${taskId}`);
  }

  const res = await fetch(glbUrl);
  if (!res.ok) {
    throw new Error(`Failed to download model: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
