const RECON_SERVICE_URL =
  process.env.RECON_SERVICE_URL ?? "http://localhost:8000";

async function post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${RECON_SERVICE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Recon service ${endpoint} failed (${res.status}): ${text}`,
    );
  }
  return res.json() as Promise<T>;
}

// ---------- Quality Check ----------

export interface QualityResult {
  image_url: string;
  blur_score: number;
  exposure_ok: boolean;
  is_duplicate: boolean;
  quality_score: number;
  is_accepted: boolean;
}

export interface QualityCheckResponse {
  results: QualityResult[];
}

/**
 * Check the quality of uploaded photos.
 * Returns per-image results; caller decides pass/fail.
 */
export async function qualityCheck(
  imageUrls: string[],
): Promise<QualityCheckResponse> {
  return post<QualityCheckResponse>("/quality-check", { image_urls: imageUrls });
}

// ---------- Preprocess ----------

export interface PreprocessResponse {
  processed_urls: string[];
  mask_urls: string[];
}

export async function preprocess(
  imageUrls: string[],
): Promise<PreprocessResponse> {
  return post<PreprocessResponse>("/preprocess", { image_urls: imageUrls });
}

// ---------- Segment ----------

export interface SegmentResponse {
  mask_urls: string[];
}

export async function segmentImages(
  imageUrls: string[],
): Promise<SegmentResponse> {
  return post<SegmentResponse>("/segment", { image_urls: imageUrls });
}

// ---------- Cleanup Mesh ----------

export interface CleanupMeshResponse {
  cleaned_mesh_url: string;
  vertex_count: number;
  face_count: number;
  bounds: Record<string, unknown>;
}

export async function cleanupMesh(
  meshUrl: string,
  targetFaces = 30000,
): Promise<CleanupMeshResponse> {
  return post<CleanupMeshResponse>("/cleanup-mesh", {
    mesh_url: meshUrl,
    target_faces: targetFaces,
  });
}

// ---------- Extract Skeleton ----------

export interface ExtractSkeletonResponse {
  skeleton: Record<string, unknown>;
}

export async function extractSkeleton(
  meshUrl: string,
): Promise<ExtractSkeletonResponse> {
  return post<ExtractSkeletonResponse>("/extract-skeleton", { mesh_url: meshUrl });
}
