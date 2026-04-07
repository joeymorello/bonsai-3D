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

export interface QualityCheckResult {
  scores: number[];
  passed: boolean;
  issues: string[];
}

export interface PreprocessResult {
  processed_paths: string[];
}

export interface SegmentResult {
  mask_paths: string[];
}

export interface CleanupMeshResult {
  cleaned_s3_key: string;
}

export interface ExtractSkeletonResult {
  skeleton: unknown;
}

/**
 * Check the quality of uploaded photos.
 */
export async function qualityCheck(
  imageUrls: string[],
): Promise<QualityCheckResult> {
  return post<QualityCheckResult>("/quality-check", { image_urls: imageUrls });
}

/**
 * Preprocess images (background removal, normalization, etc.).
 */
export async function preprocess(
  imageUrls: string[],
): Promise<PreprocessResult> {
  return post<PreprocessResult>("/preprocess", { image_urls: imageUrls });
}

/**
 * Segment images to extract foreground masks.
 */
export async function segmentImages(
  imageUrls: string[],
): Promise<SegmentResult> {
  return post<SegmentResult>("/segment", { image_urls: imageUrls });
}

/**
 * Clean up a mesh (decimate, smooth, fix normals, etc.).
 */
export async function cleanupMesh(
  meshUrl: string,
): Promise<CleanupMeshResult> {
  return post<CleanupMeshResult>("/cleanup-mesh", {
    s3_key: meshUrl,
    target_faces: 30000,
  });
}

/**
 * Extract a branch skeleton from a mesh.
 */
export async function extractSkeleton(
  meshUrl: string,
): Promise<ExtractSkeletonResult> {
  return post<ExtractSkeletonResult>("/extract-skeleton", { s3_key: meshUrl });
}
