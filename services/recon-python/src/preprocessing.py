"""Image preprocessing module for bonsai photo inputs."""

import os
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ExifTags


def normalize_orientation(image_path: str) -> str:
    """Fix EXIF rotation so the image displays correctly.

    Args:
        image_path: Path to the input image.

    Returns:
        Path to the orientation-corrected image.
    """
    img = Image.open(image_path)

    try:
        exif = img._getexif()
        if exif is not None:
            orientation_key = next(
                k for k, v in ExifTags.TAGS.items() if v == "Orientation"
            )
            orientation = exif.get(orientation_key)

            rotations = {
                3: 180,
                6: 270,
                8: 90,
            }
            if orientation in rotations:
                img = img.rotate(rotations[orientation], expand=True)
    except (StopIteration, AttributeError, KeyError):
        pass

    output_path = _temp_output(image_path, "_oriented")
    img.save(output_path, quality=95)
    return output_path


def resize_image(image_path: str, max_size: int = 2048) -> str:
    """Resize image keeping aspect ratio so the longest side is max_size.

    Args:
        image_path: Path to the input image.
        max_size: Maximum dimension in pixels.

    Returns:
        Path to the resized image.
    """
    img = Image.open(image_path)
    w, h = img.size

    if max(w, h) <= max_size:
        return image_path

    if w > h:
        new_w = max_size
        new_h = int(h * (max_size / w))
    else:
        new_h = max_size
        new_w = int(w * (max_size / h))

    img = img.resize((new_w, new_h), Image.LANCZOS)

    output_path = _temp_output(image_path, "_resized")
    img.save(output_path, quality=95)
    return output_path


def detect_blur(image_path: str) -> float:
    """Return blur score using Laplacian variance.

    Higher values indicate sharper images. Typically, scores below ~100
    indicate a blurry image.

    Args:
        image_path: Path to the input image.

    Returns:
        Blur score (Laplacian variance).
    """
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")

    laplacian = cv2.Laplacian(img, cv2.CV_64F)
    variance: float = float(laplacian.var())
    return variance


def detect_exposure_clipping(image_path: str) -> dict[str, float]:
    """Check for over/under exposure by analyzing histogram tails.

    Args:
        image_path: Path to the input image.

    Returns:
        Dictionary with 'overexposed' and 'underexposed' ratios (0.0 to 1.0).
    """
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")

    total_pixels = img.size
    overexposed = float(np.sum(img >= 250)) / total_pixels
    underexposed = float(np.sum(img <= 5)) / total_pixels

    return {
        "overexposed": overexposed,
        "underexposed": underexposed,
    }


def estimate_coverage(masks: list[str]) -> float:
    """Compute viewpoint diversity score from a set of segmentation masks.

    Uses the ratio of non-zero pixels and mask overlap to estimate how
    well the photo set covers the subject from different angles.

    Args:
        masks: List of paths to binary mask images.

    Returns:
        Coverage score from 0.0 (poor) to 1.0 (excellent).
    """
    if not masks:
        return 0.0

    areas: list[float] = []
    for mask_path in masks:
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            continue
        area = float(np.sum(mask > 128)) / mask.size
        areas.append(area)

    if not areas:
        return 0.0

    # Score based on:
    # 1. Average mask coverage (subject fills frame)
    avg_coverage = np.mean(areas)

    # 2. Variance in coverage (different viewpoints show different sizes)
    variance = float(np.var(areas))
    diversity_bonus = min(variance * 10, 0.3)

    # 3. Number of views
    view_bonus = min(len(areas) / 12.0, 0.3)

    score = float(np.clip(avg_coverage + diversity_bonus + view_bonus, 0.0, 1.0))
    return score


def _temp_output(original_path: str, suffix: str) -> str:
    """Create a temporary output path based on the original file."""
    base, ext = os.path.splitext(os.path.basename(original_path))
    fd, path = tempfile.mkstemp(suffix=f"{suffix}{ext}")
    os.close(fd)
    return path
