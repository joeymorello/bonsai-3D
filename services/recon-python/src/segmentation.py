"""Subject segmentation for bonsai images."""

import logging
import os
import tempfile

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def segment_subject(image_path: str) -> str:
    """Use rembg to remove the background and return a mask path.

    Args:
        image_path: Path to the input image.

    Returns:
        Path to the binary mask image (white = subject, black = background).
    """
    try:
        from rembg import remove

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

    except Exception as e:
        logger.warning("rembg segmentation failed, returning empty mask: %s", e)
        # Return an empty (all-black) mask matching input dimensions
        try:
            input_image = Image.open(image_path)
            mask = Image.new("L", input_image.size, 0)
        except Exception:
            mask = Image.new("L", (512, 512), 0)

    fd, mask_path = tempfile.mkstemp(suffix="_mask.png")
    os.close(fd)
    mask.save(mask_path)
    return mask_path
