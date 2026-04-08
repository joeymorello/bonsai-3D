"""Pydantic models for API request/response types."""

from typing import Any

from pydantic import BaseModel, Field


# --- Quality Check ---

class QualityResult(BaseModel):
    image_url: str = Field(..., description="URL of the checked image")
    blur_score: float = Field(..., description="Laplacian variance blur score")
    exposure_ok: bool = Field(True, description="Whether exposure is acceptable")
    is_duplicate: bool = Field(False, description="Whether image is a duplicate")
    quality_score: float = Field(..., description="Overall quality score 0-1")
    is_accepted: bool = Field(..., description="Whether image passes quality gate")


class QualityCheckRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image URLs to check")
    blur_threshold: float = Field(100.0, description="Minimum acceptable blur score")


class QualityCheckResponse(BaseModel):
    results: list[QualityResult] = Field(..., description="Quality results per image")


# --- Preprocess ---

class PreprocessRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image URLs to preprocess")
    output_prefix: str = Field("processed", description="Prefix for output file names")
    max_size: int | None = Field(2048, description="Maximum image dimension in pixels")


class PreprocessResponse(BaseModel):
    processed_urls: list[str] = Field(..., description="Paths/URLs to processed images")
    mask_urls: list[str] = Field(default_factory=list, description="Paths/URLs to generated masks")


# --- Segment ---

class SegmentRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image paths/URLs to segment")


class SegmentResponse(BaseModel):
    mask_urls: list[str] = Field(..., description="Paths to binary mask images")


# --- Mesh Cleanup ---

class CleanupMeshRequest(BaseModel):
    mesh_url: str = Field(..., description="Path or URL of the mesh to clean up")
    target_faces: int | None = Field(30000, description="Target face count after decimation")


class CleanupMeshResponse(BaseModel):
    cleaned_mesh_url: str = Field(..., description="Path/URL of the cleaned mesh")
    vertex_count: int = Field(..., description="Number of vertices in cleaned mesh")
    face_count: int = Field(..., description="Number of faces in cleaned mesh")
    bounds: dict[str, Any] = Field(default_factory=dict, description="Bounding box of cleaned mesh")


# --- Skeleton Extraction ---

class ExtractSkeletonRequest(BaseModel):
    mesh_url: str = Field(..., description="Path or URL of the mesh for skeleton extraction")


class ExtractSkeletonResponse(BaseModel):
    skeleton: dict[str, Any] = Field(..., description="Skeleton JSON with nodes, edges, root_id")


# --- Deformation ---

class DeformOperation(BaseModel):
    type: str = Field(..., description="Operation type: bend_branch, rotate_branch, prune_segment, etc.")
    branchId: str = Field(..., description="Branch/edge ID to apply operation to")
    params: dict[str, Any] = Field(default_factory=dict, description="Operation parameters")


class DeformRequest(BaseModel):
    mesh_url: str = Field(..., description="URL of the base mesh to deform")
    skeleton: dict[str, Any] = Field(..., description="Skeleton JSON")
    operations: list[DeformOperation] = Field(..., description="Edit operations to apply")


class DeformResponse(BaseModel):
    deformed_mesh_url: str = Field(..., description="Path to deformed mesh file")
    deformed_s3_key: str = Field("", description="S3 key if uploaded, else empty")
    operations_applied: int = Field(..., description="Number of operations applied")


# --- Placeholder Generation ---

class GeneratePlaceholderRequest(BaseModel):
    workspace_id: str = Field(..., description="Workspace ID for labeling")


class GeneratePlaceholderResponse(BaseModel):
    mesh_path: str = Field(..., description="Local path to generated GLB mesh")
