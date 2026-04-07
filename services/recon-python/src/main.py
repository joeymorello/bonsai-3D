"""Bonsai-3D Python reconstruction service."""

from fastapi import FastAPI, HTTPException
from .models import (
    PreprocessRequest,
    PreprocessResponse,
    SegmentRequest,
    SegmentResponse,
    QualityCheckRequest,
    QualityCheckResponse,
    MeshCleanupRequest,
    MeshCleanupResponse,
    SkeletonExtractionRequest,
    SkeletonExtractionResponse,
)
from .preprocessing import (
    normalize_orientation,
    resize_image,
    detect_blur,
    detect_exposure_clipping,
    estimate_coverage,
)
from .segmentation import segment_subject
from .mesh_cleanup import normalize_mesh, decimate_mesh, compute_bounding_box
from .skeleton_extraction import extract_skeleton

app = FastAPI(
    title="Bonsai-3D Reconstruction Service",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "recon-python"}


@app.post("/preprocess", response_model=PreprocessResponse)
async def preprocess_images(request: PreprocessRequest):
    """Receive image URLs, normalize orientation, resize, and return processed paths."""
    processed_paths: list[str] = []

    for image_url in request.image_urls:
        try:
            # Download image to temp path
            import tempfile
            import urllib.request
            import os

            with tempfile.NamedTemporaryFile(
                suffix=".jpg", delete=False
            ) as tmp:
                urllib.request.urlretrieve(image_url, tmp.name)
                tmp_path = tmp.name

            # Normalize EXIF orientation
            normalized = normalize_orientation(tmp_path)

            # Resize to max dimension
            resized = resize_image(
                normalized, max_size=request.max_size or 2048
            )

            processed_paths.append(resized)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to preprocess image {image_url}: {str(e)}",
            )

    return PreprocessResponse(processed_paths=processed_paths)


@app.post("/segment", response_model=SegmentResponse)
async def segment_images(request: SegmentRequest):
    """Run background removal/segmentation, return mask paths."""
    mask_paths: list[str] = []

    for image_url in request.image_urls:
        try:
            mask_path = segment_subject(image_url)
            mask_paths.append(mask_path)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Segmentation failed for {image_url}: {str(e)}",
            )

    return SegmentResponse(mask_paths=mask_paths)


@app.post("/quality-check", response_model=QualityCheckResponse)
async def quality_check(request: QualityCheckRequest):
    """Check blur, exposure, duplicates. Return quality scores."""
    scores: list[float] = []
    issues: list[str] = []

    for image_url in request.image_urls:
        try:
            blur_score = detect_blur(image_url)
            scores.append(blur_score)

            if blur_score < request.blur_threshold:
                issues.append(
                    f"Image {image_url} is too blurry (score: {blur_score:.2f})"
                )

            clipping = detect_exposure_clipping(image_url)
            if clipping["overexposed"] > 0.05:
                issues.append(f"Image {image_url} is overexposed")
            if clipping["underexposed"] > 0.05:
                issues.append(f"Image {image_url} is underexposed")

        except Exception as e:
            issues.append(f"Quality check failed for {image_url}: {str(e)}")
            scores.append(0.0)

    passed = len(issues) == 0
    return QualityCheckResponse(scores=scores, passed=passed, issues=issues)


@app.post("/cleanup-mesh", response_model=MeshCleanupResponse)
async def cleanup_mesh(request: MeshCleanupRequest):
    """Receive mesh path, normalize scale/axis, decimate, return cleaned path."""
    try:
        normalized_path = normalize_mesh(request.s3_key)
        cleaned_path = decimate_mesh(
            normalized_path, target_faces=request.target_faces
        )
        bounds = compute_bounding_box(cleaned_path)

        return MeshCleanupResponse(
            cleaned_s3_key=cleaned_path,
            bounds=bounds,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Mesh cleanup failed: {str(e)}",
        )


@app.post("/extract-skeleton", response_model=SkeletonExtractionResponse)
async def extract_skeleton_endpoint(request: SkeletonExtractionRequest):
    """Receive mesh path, extract branch skeleton, return skeleton JSON."""
    try:
        skeleton = extract_skeleton(request.s3_key)
        return SkeletonExtractionResponse(skeleton=skeleton)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Skeleton extraction failed: {str(e)}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
