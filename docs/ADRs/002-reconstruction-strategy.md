# ADR-002: Reconstruction Strategy

## Status

Accepted

## Date

2026-04-07

## Context

We need to convert sets of 2D bonsai photographs into 3D mesh models. The reconstruction must produce meshes suitable for skeleton extraction and interactive editing. Key requirements:

- Reliable output quality for production use.
- Reasonable turnaround time (under 20 minutes for 40 photos).
- Ability to handle the unique challenges of bonsai trees (thin branches, dense foliage, complex topology).
- Long-term cost control and reduced vendor dependency.

## Decision

We adopt a hybrid reconstruction strategy with three tiers:

### Primary: Meshy API (v1)

- Used as the default reconstruction backend for all production workloads.
- Provides consistent, high-quality mesh output with textures.
- Managed service: no GPU infrastructure to maintain.
- Cost: per-reconstruction pricing, acceptable for current scale.

### R&D Track: Hunyuan3D-2 and TRELLIS

- Open-source 3D generation models evaluated in parallel.
- **Hunyuan3D-2**: Multi-view conditioned 3D generation. Promising for few-shot reconstruction.
- **TRELLIS**: Structured latent 3D representation. Interesting for style-aware generation.
- Run on self-hosted GPU instances during evaluation.
- Goal: achieve parity with Meshy quality, then migrate primary traffic to reduce cost and increase control.
- Timeline: evaluate over M7, promote to primary if quality meets threshold.

### Fallback: COLMAP + Poisson Surface Reconstruction

- Traditional photogrammetry pipeline available as a fallback.
- Used when Meshy API is unavailable or for users who cannot use external APIs.
- Lower quality for bonsai-specific features (thin branches often lost), but no external dependencies.

### Custom Skeleton Extraction (All Paths)

- Regardless of reconstruction source, all meshes pass through our custom skeleton extraction pipeline.
- Laplacian contraction followed by topology-based graph simplification.
- This decouples the editor from the reconstruction method: any mesh source produces the same branch graph format.

## Alternatives Considered

### COLMAP-only

Rejected as primary. COLMAP struggles with thin bonsai branches and requires many more photos for acceptable quality. Reconstruction times are longer (30-60 minutes). Kept as fallback.

### Single open-source model (e.g., NeRF-based)

Rejected as primary. Current open-source single-object reconstruction models do not reliably produce watertight, textured meshes suitable for skeleton extraction. Quality is inconsistent. Pursued as R&D track instead.

### No skeleton extraction (edit mesh directly)

Rejected. Direct mesh editing (vertex pushing) does not provide the semantic understanding of branch structure needed for pruning, bending, and style operations. Skeleton extraction is essential for meaningful bonsai editing.

### Commercial photogrammetry software (RealityCapture, Metashape)

Rejected. Desktop-only, expensive per-seat licensing, difficult to integrate into an automated web pipeline. Meshy API provides comparable quality with better integration characteristics.

## Consequences

- **Positive**: Production reliability via Meshy API from day one. Clear path to cost reduction via open-source R&D. Fallback ensures availability. Unified skeleton extraction regardless of source.
- **Negative**: Meshy API cost scales with usage. R&D track requires GPU infrastructure investment. Three reconstruction paths increase testing surface.
- **Mitigations**: Cleanup and skeleton extraction are reconstruction-agnostic, reducing per-path complexity. Quality comparison tooling (M7) will provide objective metrics for promotion decisions.
