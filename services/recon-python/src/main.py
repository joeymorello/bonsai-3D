"""Bonsai-3D Python reconstruction service."""

import logging
import os
import tempfile

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    PreprocessRequest,
    PreprocessResponse,
    SegmentRequest,
    SegmentResponse,
    QualityCheckRequest,
    QualityCheckResponse,
    QualityResult,
    CleanupMeshRequest,
    CleanupMeshResponse,
    ExtractSkeletonRequest,
    ExtractSkeletonResponse,
)
from .preprocessing import (
    normalize_orientation,
    resize_image,
    detect_blur,
    detect_exposure_clipping,
    download_to_temp,
)
from .segmentation import segment_subject
from .mesh_cleanup import normalize_mesh, decimate_mesh, compute_bounding_box
from .skeleton_extraction import extract_skeleton

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Bonsai-3D Reconstruction Service",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "recon-python", "version": "0.1.0"}


@app.post("/quality-check", response_model=QualityCheckResponse)
async def quality_check(request: QualityCheckRequest):
    """Check blur, exposure, and duplicates. Return quality results per image."""
    results: list[QualityResult] = []

    for image_url in request.image_urls:
        try:
            local_path = download_to_temp(image_url)

            blur_score = detect_blur(local_path)
            clipping = detect_exposure_clipping(local_path)

            overexposed = clipping["overexposed"] > 0.05
            underexposed = clipping["underexposed"] > 0.05
            exposure_ok = not overexposed and not underexposed

            blur_ok = blur_score >= request.blur_threshold
            quality_score = min(blur_score / 500.0, 1.0)
            if not exposure_ok:
                quality_score *= 0.5

            is_accepted = blur_ok and exposure_ok

            results.append(QualityResult(
                image_url=image_url,
                blur_score=blur_score,
                exposure_ok=exposure_ok,
                is_duplicate=False,
                quality_score=round(quality_score, 3),
                is_accepted=is_accepted,
            ))
        except Exception as e:
            logger.exception("Quality check failed for %s", image_url)
            results.append(QualityResult(
                image_url=image_url,
                blur_score=0.0,
                exposure_ok=False,
                is_duplicate=False,
                quality_score=0.0,
                is_accepted=False,
            ))

    return QualityCheckResponse(results=results)


@app.post("/preprocess", response_model=PreprocessResponse)
async def preprocess_images(request: PreprocessRequest):
    """Receive image URLs, normalize orientation, resize, and return processed paths."""
    processed_urls: list[str] = []
    mask_urls: list[str] = []

    for image_url in request.image_urls:
        try:
            local_path = download_to_temp(image_url)

            normalized = normalize_orientation(local_path)
            resized = resize_image(normalized, max_size=request.max_size or 2048)

            processed_urls.append(resized)
        except Exception as e:
            logger.exception("Failed to preprocess image %s", image_url)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to preprocess image {image_url}: {str(e)}",
            )

    return PreprocessResponse(processed_urls=processed_urls, mask_urls=mask_urls)


@app.post("/segment", response_model=SegmentResponse)
async def segment_images(request: SegmentRequest):
    """Run background removal/segmentation, return mask paths."""
    mask_urls: list[str] = []

    for image_url in request.image_urls:
        try:
            local_path = download_to_temp(image_url)
            mask_path = segment_subject(local_path)
            mask_urls.append(mask_path)
        except Exception as e:
            logger.exception("Segmentation failed for %s", image_url)
            raise HTTPException(
                status_code=400,
                detail=f"Segmentation failed for {image_url}: {str(e)}",
            )

    return SegmentResponse(mask_urls=mask_urls)


@app.post("/cleanup-mesh", response_model=CleanupMeshResponse)
async def cleanup_mesh(request: CleanupMeshRequest):
    """Receive mesh path/URL, normalize scale/axis, decimate, return cleaned path."""
    try:
        local_path = download_to_temp(request.mesh_url)

        normalized_path = normalize_mesh(local_path)

        target = request.target_faces or 30000
        cleaned_path = decimate_mesh(normalized_path, target_faces=target)

        bounds = compute_bounding_box(cleaned_path)

        import trimesh
        mesh = trimesh.load(cleaned_path, force="mesh")

        return CleanupMeshResponse(
            cleaned_mesh_url=cleaned_path,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.faces),
            bounds=bounds,
        )
    except Exception as e:
        logger.exception("Mesh cleanup failed")
        raise HTTPException(
            status_code=500,
            detail=f"Mesh cleanup failed: {str(e)}",
        )


@app.post("/extract-skeleton", response_model=ExtractSkeletonResponse)
async def extract_skeleton_endpoint(request: ExtractSkeletonRequest):
    """Receive mesh path/URL, extract branch skeleton, return skeleton JSON."""
    try:
        local_path = download_to_temp(request.mesh_url)
        skeleton = extract_skeleton(local_path)
        return ExtractSkeletonResponse(skeleton=skeleton)
    except Exception as e:
        logger.exception("Skeleton extraction failed")
        raise HTTPException(
            status_code=500,
            detail=f"Skeleton extraction failed: {str(e)}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
