import type {
  ApiResult,
  CreateWorkspaceRequest,
  CreateVariationRequest,
  ExportFormat,
  ExportRequest,
  ExportResult,
  EditOperation,
  JobProgress,
  ModelAsset,
  PaginatedResponse,
  PresignedUploadUrl,
  ReconProvider,
  SaveEditsRequest,
  StartReconstructionRequest,
  StyleVariation,
  UpdateWorkspaceRequest,
  UploadPhoto,
  Workspace,
  WorkspaceDetail,
} from "@bonsai-3d/shared-types";

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | undefined;
  private onUnauthorized: (() => void) | undefined;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.onUnauthorized = options.onUnauthorized;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = undefined;
  }

  // ── Workspaces ──────────────────────────────

  async listWorkspaces(
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<PaginatedResponse<Workspace>>> {
    return this.get(`/workspaces?page=${page}&pageSize=${pageSize}`);
  }

  async getWorkspace(id: string): Promise<ApiResult<WorkspaceDetail>> {
    return this.get(`/workspaces/${id}`);
  }

  async createWorkspace(
    data: CreateWorkspaceRequest,
  ): Promise<ApiResult<Workspace>> {
    return this.post("/workspaces", data);
  }

  async updateWorkspace(
    id: string,
    data: UpdateWorkspaceRequest,
  ): Promise<ApiResult<Workspace>> {
    return this.patch(`/workspaces/${id}`, data);
  }

  async deleteWorkspace(id: string): Promise<ApiResult<{ deleted: boolean }>> {
    return this.delete(`/workspaces/${id}`);
  }

  // ── Photos ──────────────────────────────────

  async getUploadUrls(
    workspaceId: string,
    count: number,
  ): Promise<ApiResult<PresignedUploadUrl[]>> {
    return this.post(`/workspaces/${workspaceId}/photos/upload-urls`, {
      count,
    });
  }

  async confirmUploads(
    workspaceId: string,
    keys: string[],
  ): Promise<ApiResult<UploadPhoto[]>> {
    return this.post(`/workspaces/${workspaceId}/photos/confirm`, { keys });
  }

  async deletePhoto(
    workspaceId: string,
    photoId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    return this.delete(`/workspaces/${workspaceId}/photos/${photoId}`);
  }

  // ── Reconstruction ─────────────────────────

  async startReconstruction(
    workspaceId: string,
    provider?: ReconProvider,
  ): Promise<ApiResult<{ jobId: string }>> {
    const body: StartReconstructionRequest = { workspaceId, provider };
    return this.post(`/workspaces/${workspaceId}/reconstruct`, body);
  }

  async getJobProgress(jobId: string): Promise<ApiResult<JobProgress>> {
    return this.get(`/jobs/${jobId}/progress`);
  }

  // ── Assets ─────────────────────────────────

  async listAssets(workspaceId: string): Promise<ApiResult<ModelAsset[]>> {
    return this.get(`/workspaces/${workspaceId}/assets`);
  }

  // ── Variations ─────────────────────────────

  async listVariations(
    workspaceId: string,
  ): Promise<ApiResult<StyleVariation[]>> {
    return this.get(`/workspaces/${workspaceId}/variations`);
  }

  async createVariation(
    data: CreateVariationRequest,
  ): Promise<ApiResult<StyleVariation>> {
    return this.post(
      `/workspaces/${data.workspaceId}/variations`,
      data,
    );
  }

  async saveEdits(
    variationId: string,
    operations: EditOperation[],
  ): Promise<ApiResult<StyleVariation>> {
    const body: SaveEditsRequest = { variationId, operations };
    return this.put(`/variations/${variationId}/edits`, body);
  }

  async deleteVariation(
    variationId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    return this.delete(`/variations/${variationId}`);
  }

  // ── Export ─────────────────────────────────

  async exportVariation(
    workspaceId: string,
    variationId: string,
    format: ExportFormat,
  ): Promise<ApiResult<ExportResult>> {
    const body: ExportRequest = { workspaceId, variationId, format };
    return this.post("/exports", body);
  }

  // ── HTTP helpers ───────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      this.onUnauthorized?.();
    }

    const json = await res.json();
    return json as ApiResult<T>;
  }

  private get<T>(path: string) {
    return this.request<T>("GET", path);
  }

  private post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, body);
  }

  private put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, body);
  }

  private patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  private delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
