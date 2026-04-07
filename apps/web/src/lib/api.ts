// ---------------------------------------------------------------------------
// API client – thin wrappers around fetch that talk to the backend at /api
// ---------------------------------------------------------------------------

// In dev mode with the Vite proxy, "/api" is proxied to the backend.
// In production or when VITE_API_URL is set without a proxy, use the full URL.
const BASE = "";

// ---- Auth token helpers ---------------------------------------------------

const TOKEN_KEY = "bonsai_auth_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---- Core request helper --------------------------------------------------

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    clearAuthToken();
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ---- Auth -----------------------------------------------------------------

export interface AuthResponse {
  token: string;
  user: { id: string; email: string };
}

export async function login(email: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  setAuthToken(data.token);
  return data;
}

export async function register(email: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  setAuthToken(data.token);
  return data;
}

// ---- Types ----------------------------------------------------------------

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  speciesGuess: string | null;
  status: "draft" | "uploading" | "processing" | "ready" | "failed";
  coverImageUrl: string | null;
  originalModelAssetId: string | null;
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
  url: string;
  key: string;
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
  speciesGuess?: string;
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
    `/workspaces/${workspaceId}/uploads/presign`,
    {
      method: "POST",
      body: JSON.stringify({ filename, contentType }),
    },
  );
}

export function completeUpload(
  workspaceId: string,
  storageKey: string,
): Promise<Photo> {
  return request<Photo>(`/workspaces/${workspaceId}/uploads/complete`, {
    method: "POST",
    body: JSON.stringify({ storageKey }),
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
    `/workspaces/${workspaceId}/reconstruction-status`,
  );
}

// ---- Variations -----------------------------------------------------------

export function listVariations(workspaceId: string): Promise<Variation[]> {
  return request<Variation[]>(`/workspaces/${workspaceId}/variations`);
}

export function getVariation(
  variationId: string,
): Promise<Variation> {
  return request<Variation>(
    `/variations/${variationId}`,
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
  variationId: string,
  operation: BranchOperation,
): Promise<Variation> {
  return request<Variation>(
    `/variations/${variationId}/operations`,
    {
      method: "POST",
      body: JSON.stringify(operation),
    },
  );
}

export function deleteVariation(
  variationId: string,
): Promise<void> {
  return request<void>(
    `/variations/${variationId}`,
    { method: "DELETE" },
  );
}

export function exportVariation(
  variationId: string,
  format: "glb" | "obj" | "usdz" = "glb",
): Promise<{ downloadUrl: string }> {
  return request<{ downloadUrl: string }>(
    `/variations/${variationId}/export`,
    {
      method: "POST",
      body: JSON.stringify({ format }),
    },
  );
}

// ---- Assets ---------------------------------------------------------------

export function getAssetManifest(assetId: string): Promise<AssetManifest> {
  return request<AssetManifest>(`/assets/${assetId}/manifest`);
}

export function getDownloadUrl(
  assetId: string,
): Promise<{ url: string }> {
  return request<{ url: string }>(
    `/assets/${assetId}/download-url`,
  );
}
