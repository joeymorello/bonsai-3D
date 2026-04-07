// ---------------------------------------------------------------------------
// API client – thin wrappers around fetch that talk to the backend at /api
// ---------------------------------------------------------------------------

const BASE = "/api";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Types ----------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  species: string | null;
  status: "created" | "uploading" | "processing" | "ready" | "error";
  coverUrl: string | null;
  photoCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: string;
  workspaceId: string;
  filename: string;
  url: string;
  quality: "good" | "fair" | "poor" | null;
  createdAt: string;
}

export interface PresignedUpload {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
}

export interface ReconstructionStatus {
  workspaceId: string;
  step: string;
  progress: number;
  logs: string[];
  error: string | null;
}

export interface Variation {
  id: string;
  workspaceId: string;
  name: string;
  thumbnailUrl: string | null;
  operations: BranchOperation[];
  createdAt: string;
  updatedAt: string;
}

export interface BranchOperation {
  type: "bend" | "rotate" | "prune" | "prune_cluster";
  branchId: string;
  params: Record<string, unknown>;
}

export interface AssetManifest {
  meshUrl: string;
  skeletonUrl: string;
  textureUrls: string[];
}

// ---- Workspaces -----------------------------------------------------------

export function listWorkspaces(): Promise<Workspace[]> {
  return request<Workspace[]>("/workspaces");
}

export function getWorkspace(id: string): Promise<Workspace> {
  return request<Workspace>(`/workspaces/${id}`);
}

export function createWorkspace(data: {
  name: string;
  species?: string;
}): Promise<Workspace> {
  return request<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteWorkspace(id: string): Promise<void> {
  return request<void>(`/workspaces/${id}`, { method: "DELETE" });
}

// ---- Photos / Upload ------------------------------------------------------

export function listPhotos(workspaceId: string): Promise<Photo[]> {
  return request<Photo[]>(`/workspaces/${workspaceId}/photos`);
}

export function getPresignedUpload(
  workspaceId: string,
  filename: string,
  contentType: string,
): Promise<PresignedUpload> {
  return request<PresignedUpload>(
    `/workspaces/${workspaceId}/photos/presign`,
    {
      method: "POST",
      body: JSON.stringify({ filename, contentType }),
    },
  );
}

export function completeUpload(
  workspaceId: string,
  uploadId: string,
): Promise<Photo> {
  return request<Photo>(`/workspaces/${workspaceId}/photos/complete`, {
    method: "POST",
    body: JSON.stringify({ uploadId }),
  });
}

// ---- Reconstruction -------------------------------------------------------

export function startReconstruction(workspaceId: string): Promise<void> {
  return request<void>(`/workspaces/${workspaceId}/reconstruct`, {
    method: "POST",
  });
}

export function getReconstructionStatus(
  workspaceId: string,
): Promise<ReconstructionStatus> {
  return request<ReconstructionStatus>(
    `/workspaces/${workspaceId}/reconstruct/status`,
  );
}

// ---- Variations -----------------------------------------------------------

export function listVariations(workspaceId: string): Promise<Variation[]> {
  return request<Variation[]>(`/workspaces/${workspaceId}/variations`);
}

export function getVariation(
  workspaceId: string,
  variationId: string,
): Promise<Variation> {
  return request<Variation>(
    `/workspaces/${workspaceId}/variations/${variationId}`,
  );
}

export function createVariation(
  workspaceId: string,
  data: { name: string; sourceVariationId?: string },
): Promise<Variation> {
  return request<Variation>(`/workspaces/${workspaceId}/variations`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function addOperation(
  workspaceId: string,
  variationId: string,
  operation: BranchOperation,
): Promise<Variation> {
  return request<Variation>(
    `/workspaces/${workspaceId}/variations/${variationId}/operations`,
    {
      method: "POST",
      body: JSON.stringify(operation),
    },
  );
}

export function deleteVariation(
  workspaceId: string,
  variationId: string,
): Promise<void> {
  return request<void>(
    `/workspaces/${workspaceId}/variations/${variationId}`,
    { method: "DELETE" },
  );
}

export function exportVariation(
  workspaceId: string,
  variationId: string,
  format: "glb" | "obj" | "usdz" = "glb",
): Promise<{ downloadUrl: string }> {
  return request<{ downloadUrl: string }>(
    `/workspaces/${workspaceId}/variations/${variationId}/export`,
    {
      method: "POST",
      body: JSON.stringify({ format }),
    },
  );
}

// ---- Assets ---------------------------------------------------------------

export function getAssetManifest(workspaceId: string): Promise<AssetManifest> {
  return request<AssetManifest>(`/workspaces/${workspaceId}/assets/manifest`);
}

export function getDownloadUrl(
  workspaceId: string,
  assetPath: string,
): Promise<{ url: string }> {
  return request<{ url: string }>(
    `/workspaces/${workspaceId}/assets/download?path=${encodeURIComponent(assetPath)}`,
  );
}
