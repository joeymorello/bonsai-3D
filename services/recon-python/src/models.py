"""Pydantic models for API request/response types."""

from typing import Any

from pydantic import BaseModel, Field


# --- Preprocess ---

class PreprocessRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image URLs to preprocess")
    max_size: int | None = Field(2048, description="Maximum image dimension in pixels")


class PreprocessResponse(BaseModel):
    processed_paths: list[str] = Field(..., description="Paths to processed images")


# --- Segment ---

class SegmentRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image paths to segment")


class SegmentResponse(BaseModel):
    mask_paths: list[str] = Field(..., description="Paths to binary mask images")


# --- Quality Check ---

class QualityCheckRequest(BaseModel):
    image_urls: list[str] = Field(..., description="List of image paths to check")
    blur_threshold: float = Field(100.0, description="Minimum acceptable blur score")


class QualityCheckResponse(BaseModel):
    scores: list[float] = Field(..., description="Blur scores for each image")
    passed: bool = Field(..., description="Whether all images passed quality checks")
    issues: list[str] = Field(default_factory=list, description="List of quality issues found")


# --- Mesh Cleanup ---

class MeshCleanupRequest(BaseModel):
    s3_key: str = Field(..., description="S3 key of the mesh to clean up")
    target_faces: int = Field(30000, description="Target face count after decimation")


class MeshCleanupResponse(BaseModel):
    cleaned_s3_key: str = Field(..., description="S3 key of the cleaned mesh")
    bounds: dict[str, Any] = Field(default_factory=dict, description="Bounding box of cleaned mesh")


# --- Skeleton Extraction ---

class SkeletonExtractionRequest(BaseModel):
    s3_key: str = Field(..., description="S3 key of the mesh for skeleton extraction")


class SkeletonExtractionResponse(BaseModel):
    skeleton: dict[str, Any] = Field(..., description="Branch graph skeleton data")
