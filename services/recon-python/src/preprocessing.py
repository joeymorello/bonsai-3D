"""Image preprocessing module for bonsai photo inputs."""

import os
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

import cv2
import numpy as np
from PIL import Image, ExifTags


def download_to_temp(url_or_path: str) -> str:
    """Download a URL to a temporary file, or return the path if it is local.

    Supports file paths, file:// URLs, http/https URLs (including S3 presigned).

    Args:
        url_or_path: A local file path or an HTTP(S) URL.

    Returns:
        Local file path to the downloaded or existing file.
    """
    parsed = urlparse(url_or_path)

    # Local file path
    if parsed.scheme in ("", "file"):
        local_path = parsed.path if parsed.scheme == "file" else url_or_path
        if os.path.isfile(local_path):
            return local_path
        raise FileNotFoundError(f"Local file not found: {local_path}")

    # HTTP(S) URL - download to temp file
    if parsed.scheme in ("http", "https"):
        suffix = _guess_extension(parsed.path)
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        try:
            urllib.request.urlretrieve(url_or_path, tmp_path)
        except Exception as e:
            os.unlink(tmp_path)
            raise RuntimeError(f"Failed to download {url_or_path}: {e}") from e
        return tmp_path

    raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")


def _guess_extension(path: str) -> str:
    """Guess file extension from URL path."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".glb", ".obj", ".ply", ".stl"):
        return ext
    return ".tmp"


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


def _temp_output(original_path: str, suffix: str) -> str:
    """Create a temporary output path based on the original file."""
    base, ext = os.path.splitext(os.path.basename(original_path))
    if not ext:
        ext = ".jpg"
    fd, path = tempfile.mkstemp(suffix=f"{suffix}{ext}")
    os.close(fd)
    return path
