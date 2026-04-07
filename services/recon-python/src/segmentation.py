"""Subject segmentation for bonsai images."""

import os
import tempfile

import cv2
import numpy as np
from PIL import Image
from rembg import remove


def segment_subject(image_path: str) -> str:
    """Use rembg to remove the background and return a mask path.

    Args:
        image_path: Path to the input image.

    Returns:
        Path to the binary mask image (white = subject, black = background).
    """
    input_image = Image.open(image_path)

    # rembg returns an RGBA image with transparent background
    output_image = remove(input_image)

    # Extract alpha channel as mask
    if output_image.mode == "RGBA":
        alpha = output_image.split()[-1]
        mask = alpha.point(lambda p: 255 if p > 128 else 0)
    else:
        # Fallback: convert to grayscale and threshold
        gray = output_image.convert("L")
        mask = gray.point(lambda p: 255 if p > 128 else 0)

    base, ext = os.path.splitext(os.path.basename(image_path))
    fd, mask_path = tempfile.mkstemp(suffix=f"_mask.png")
    os.close(fd)

    mask.save(mask_path)
    return mask_path


def separate_regions(
    mask_path: str, image_path: str
) -> dict[str, str]:
    """Attempt to classify trunk vs foliage regions in a bonsai image.

    Uses color and position heuristics to separate the mask into
    trunk and foliage sub-masks.

    Args:
        mask_path: Path to the segmentation mask.
        image_path: Path to the original image.

    Returns:
        Dictionary with 'trunk_mask' and 'foliage_mask' file paths.
    """
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    image = cv2.imread(image_path)

    if mask is None or image is None:
        raise ValueError("Could not read mask or image")

    # Convert to HSV for color-based separation
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Green-ish hue range for foliage (hue ~35-85 in OpenCV's 0-180 scale)
    lower_green = np.array([25, 30, 30])
    upper_green = np.array([90, 255, 255])
    foliage_color_mask = cv2.inRange(hsv, lower_green, upper_green)

    # Brown/gray range for trunk (low saturation or warm hue)
    lower_brown = np.array([5, 20, 30])
    upper_brown = np.array([25, 200, 200])
    trunk_color_mask = cv2.inRange(hsv, lower_brown, upper_brown)

    # Combine with subject mask
    subject = mask > 128
    foliage_region = np.logical_and(subject, foliage_color_mask > 0).astype(
        np.uint8
    ) * 255
    trunk_region = np.logical_and(subject, trunk_color_mask > 0).astype(
        np.uint8
    ) * 255

    # Morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    foliage_region = cv2.morphologyEx(foliage_region, cv2.MORPH_CLOSE, kernel)
    trunk_region = cv2.morphologyEx(trunk_region, cv2.MORPH_CLOSE, kernel)

    # Save results
    fd1, foliage_path = tempfile.mkstemp(suffix="_foliage_mask.png")
    os.close(fd1)
    cv2.imwrite(foliage_path, foliage_region)

    fd2, trunk_path = tempfile.mkstemp(suffix="_trunk_mask.png")
    os.close(fd2)
    cv2.imwrite(trunk_path, trunk_region)

    return {
        "trunk_mask": trunk_path,
        "foliage_mask": foliage_path,
    }
