# Reconstruction Pipeline

This document details the end-to-end pipeline for turning a set of bonsai photographs into an editable 3D model with a branch skeleton.

## 1. Input Capture Requirements

### Photo Count

- **Minimum**: 20 photos for acceptable reconstruction quality.
- **Recommended**: 40-60 photos for detailed models.
- **Maximum**: 80 photos (diminishing returns and longer processing beyond this).

### Coverage Guidance

- Orbit the bonsai at roughly equal angular intervals (every 10-15 degrees).
- Capture at least two elevation tiers: eye-level and slightly above (30-45 degrees).
- Include close-ups of the trunk base, major branch junctions, and canopy top.
- Use a plain, contrasting background if possible (improves segmentation).
- Consistent lighting; avoid mixed artificial/natural light.
- No flash (creates specular highlights that confuse reconstruction).

### Camera Settings

- Fixed focal length preferred (no zoom changes between shots).
- Aperture f/8 or narrower for depth of field across the entire tree.
- ISO as low as possible to minimize noise.
- RAW or high-quality JPEG.

## 2. Photo QA Checks

Each uploaded photo is evaluated before entering the pipeline. Photos that fail critical checks are flagged and excluded.

| Check | Method | Threshold | Action |
|---|---|---|---|
| Blur detection | Laplacian variance | < 100 | Exclude, warn user |
| Duplicate detection | Perceptual hash (pHash) | Hamming distance < 5 | Keep best, drop duplicate |
| Exposure check | Histogram analysis | < 5% or > 95% clipped pixels | Warn user, include if mild |
| Coverage analysis | Feature matching + angular estimation | Gaps > 30 degrees | Warn user, suggest additional angles |
| Resolution check | Pixel dimensions | < 1024px on short edge | Exclude, warn user |

The QA stage produces a report summarizing accepted/rejected photos and coverage gaps. The user can review and re-upload before proceeding.

## 3. Preprocessing

### Normalize

- Strip EXIF rotation; apply orientation correction.
- Convert to sRGB color space.
- Normalize white balance across the set using gray-world assumption.

### Resize

- Downscale to max 2048px on the long edge for reconstruction input.
- Preserve original resolution copies for texture extraction.

### Segment Foreground

- Run background removal using a U2-Net or similar salient object detection model.
- Generate per-photo binary masks (foreground = white, background = black).
- Store masks alongside processed photos for reconstruction masking.

### Generate COLMAP-Compatible Data (if needed)

- Extract EXIF focal length and sensor size for camera intrinsics estimation.
- Write `images.txt` and `cameras.txt` in COLMAP format.

## 4. Reconstruction Modes

### Primary: Meshy API (v1)

The default reconstruction path for production use.

- Upload processed photos and masks to Meshy via their API.
- Poll for completion (typical turnaround: 5-15 minutes).
- Download the resulting mesh (OBJ/GLB) and textures.
- **Pros**: Reliable, good quality, no GPU infrastructure needed.
- **Cons**: External dependency, per-reconstruction cost, limited control over internals.

### R&D Track: Hunyuan3D-2 / TRELLIS

Open-source models being evaluated for self-hosted reconstruction.

- **Hunyuan3D-2**: Multi-view diffusion model; generates 3D from sparse views.
- **TRELLIS**: Structured latent representation for 3D generation.
- Run on GPU instances (A100/H100 recommended).
- Currently experimental; quality and reliability under active evaluation.
- Goal: reduce per-reconstruction cost and increase control over output.

### Fallback: COLMAP + Poisson Surface Reconstruction

Traditional photogrammetry pipeline as a fallback.

- COLMAP feature extraction and matching.
- Sparse reconstruction (Structure from Motion).
- Dense reconstruction (Multi-View Stereo).
- Poisson surface reconstruction from dense point cloud.
- **Pros**: Well-understood, no external API dependency.
- **Cons**: Slower, requires more photos, struggles with thin branches and foliage.

## 5. Cleanup Stage

All reconstruction outputs, regardless of source, pass through the same cleanup pipeline.

### Normalize Scale

- Detect the bonsai bounding box.
- Scale so the tree fits within a 1.0 x 1.0 x 1.0 unit cube (longest axis = 1.0).
- Record the scale factor for real-world dimension recovery if needed.

### Align Axis

- Detect the trunk using vertical symmetry analysis and ground plane estimation.
- Align the trunk to the Y-axis (up).
- Center the model at the origin on the XZ plane.

### Decimate

- Reduce mesh complexity to a target polygon count (default: 100k triangles).
- Use quadric edge collapse decimation (preserves shape features).
- Preserve UV coordinates and texture mapping.

### Separate Trunk and Foliage

- Classify mesh regions as trunk (woody) or foliage (leafy) based on:
  - Color/texture analysis (brown/gray vs. green).
  - Surface curvature (smooth cylindrical vs. irregular clustered).
  - Geometric heuristics (proximity to skeleton, distance from center).
- Tag vertices with trunk/foliage labels.
- This separation informs skeleton extraction and editor behavior.

## 6. Skeleton Extraction

The skeleton extraction stage converts the cleaned mesh into a branch graph suitable for the editor.

### Approach

1. **Laplacian Contraction**: Iteratively contract the mesh toward its medial axis using cotangent Laplacian smoothing with area-weighted attraction terms.
2. **Topology Simplification**: Collapse the contracted mesh into a 1D skeletal graph. Merge nearby nodes, remove spurious branches shorter than a threshold.
3. **Radius Estimation**: For each skeleton node, estimate the local branch radius by measuring the average distance to the original mesh surface.
4. **Root Detection**: Identify the root node as the lowest point on the skeleton graph (closest to the ground plane).
5. **Branch Ordering**: Traverse from root to tips, assigning branch order (primary trunk = 0, first branches = 1, etc.).

### Output

The skeleton is stored as a JSON branch graph (see [Editor Data Model](editor-data-model.md) for the schema). It contains:

- Node positions (3D coordinates)
- Node radii
- Parent-child connectivity
- Branch order labels
- Trunk/foliage classification per segment
