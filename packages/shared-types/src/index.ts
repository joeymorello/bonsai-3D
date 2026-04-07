// ──────────────────────────────────────────────
// Status enums
// ──────────────────────────────────────────────

export type WorkspaceStatus =
  | "created"
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "archived";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type JobStage =
  | "photo_qa"
  | "preprocess_images"
  | "submit_reconstruction"
  | "poll_reconstruction"
  | "download_result"
  | "cleanup_geometry"
  | "extract_skeleton"
  | "publish_workspace"
  | "generate_thumbnails";

export type ReconProvider = "meshy" | "tripo" | "local";

export type AssetKind =
  | "original_model"
  | "cleaned_model"
  | "skeleton"
  | "thumbnail"
  | "variation_model"
  | "export";

export type ExportFormat = "glb" | "obj" | "usdz";

// ──────────────────────────────────────────────
// Core data models
// ──────────────────────────────────────────────

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  status: WorkspaceStatus;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadPhoto {
  id: string;
  workspaceId: string;
  originalUrl: string;
  processedUrl: string | null;
  maskUrl: string | null;
  qualityScore: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface ReconstructionJob {
  id: string;
  workspaceId: string;
  provider: ReconProvider;
  status: JobStatus;
  stage: JobStage | null;
  progress: number;
  providerJobId: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ModelAsset {
  id: string;
  workspaceId: string;
  kind: AssetKind;
  url: string;
  s3Key: string;
  fileSizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface StyleVariation {
  id: string;
  workspaceId: string;
  name: string;
  parentVariationId: string | null;
  editOperations: EditOperation[];
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditOperation {
  type: "bend" | "rotate" | "translate" | "prune";
  branchId: string;
  params: {
    handleIndex?: number;
    delta?: [number, number, number];
    axis?: [number, number, number];
    angle?: number;
  };
  timestamp: string;
}

// ──────────────────────────────────────────────
// API request types
// ──────────────────────────────────────────────

export interface CreateWorkspaceRequest {
  name: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  status?: WorkspaceStatus;
}

export interface UploadPhotosRequest {
  workspaceId: string;
  photos: Blob[];
}

export interface StartReconstructionRequest {
  workspaceId: string;
  provider?: ReconProvider;
}

export interface CreateVariationRequest {
  workspaceId: string;
  name: string;
  parentVariationId?: string;
}

export interface SaveEditsRequest {
  variationId: string;
  operations: EditOperation[];
}

export interface ExportRequest {
  workspaceId: string;
  variationId: string;
  format: ExportFormat;
}

// ──────────────────────────────────────────────
// API response types
// ──────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PresignedUploadUrl {
  url: string;
  key: string;
  expiresAt: string;
}

export interface WorkspaceDetail extends Workspace {
  photos: UploadPhoto[];
  currentJob: ReconstructionJob | null;
  assets: ModelAsset[];
  variations: StyleVariation[];
}

export interface ExportResult {
  downloadUrl: string;
  format: ExportFormat;
  fileSizeBytes: number;
  expiresAt: string;
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  stage: JobStage | null;
  progress: number;
  message: string;
}
