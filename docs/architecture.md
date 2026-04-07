# System Architecture

## High-Level Overview

bonsai-3D is a three-tier application with a React/Three.js frontend, a Node.js API layer, and Python reconstruction services, backed by Postgres, Redis, and S3-compatible object storage.

```
+------------------+       +------------------+       +---------------------+
|                  |       |                  |       |                     |
|  React + R3F     | <---> |  Node/Fastify    | <---> |  Python Services    |
|  (browser)       |  REST |  API             | HTTP  |  recon / skeleton   |
|                  |  + WS |                  |       |                     |
+------------------+       +--------+---------+       +----------+----------+
                                    |                            |
                           +--------+---------+         +--------+----------+
                           |  PostgreSQL 16   |         |  S3 / MinIO       |
                           |  (metadata,      |         |  (photos, meshes, |
                           |   user data,     |         |   textures,       |
                           |   job state)     |         |   job artifacts)  |
                           +------------------+         +-------------------+
                                    |
                           +--------+---------+
                           |  Redis 7         |
                           |  (BullMQ jobs,   |
                           |   session cache, |
                           |   pub/sub)       |
                           +------------------+
```

## Component Responsibilities

### apps/web (Frontend)

- Photo upload and management UI
- 3D viewport (React Three Fiber) for viewing and editing reconstructed models
- Branch editor: bend, rotate, translate, prune operations
- Style variation browser and comparison view
- WebSocket connection for real-time job progress

### apps/api (API Server)

- REST API for workspace CRUD, photo upload, job management, edit operations
- WebSocket server for pushing job status updates to the frontend
- BullMQ job producer: enqueues reconstruction, cleanup, and skeleton jobs
- Presigned URL generation for direct S3 uploads/downloads
- Authentication and authorization

### services/recon (Reconstruction Service)

- BullMQ job consumer (via Python bridge or HTTP callback)
- Photo QA: blur detection, duplicate filtering, exposure checks
- Preprocessing: normalization, resizing, background segmentation
- Reconstruction dispatch: Meshy API, Hunyuan3D-2, COLMAP
- Mesh cleanup: scale normalization, axis alignment, decimation

### services/skeleton (Skeleton Extraction Service)

- Consumes cleaned meshes, produces branch graph structures
- Topology-based skeleton extraction (mean curvature flow, Laplacian contraction)
- Trunk/foliage separation heuristics
- Outputs JSON branch graph with node positions, radii, and connectivity

## Data Flow

```
Upload Photos
     |
     v
Photo QA Checks (blur, duplicates, exposure, coverage)
     |
     v
Preprocess (normalize, resize, segment foreground, generate masks)
     |
     v
Reconstruct 3D Model (Meshy API / Hunyuan3D-2 / COLMAP)
     |
     v
Cleanup (normalize scale, align axis, decimate, separate trunk/foliage)
     |
     v
Skeletonize (extract branch graph from mesh topology)
     |
     v
Editor Ready (user can view, edit, prune, create variations)
```

Each stage is a BullMQ job with its own queue. Jobs are chained: completion of one stage enqueues the next. The API server tracks overall pipeline state in Postgres and pushes progress updates via WebSocket.

## Storage Strategy

All binary assets are stored in S3-compatible storage. Postgres holds only metadata and references (S3 keys).

### Bucket Layout

```
bonsai-3d-assets/
  workspaces/
    {workspace_id}/
      photos/
        original/       # uploaded photos as-is
        processed/      # normalized, resized photos
        masks/          # foreground segmentation masks
      models/
        raw/            # reconstruction output (raw mesh)
        cleaned/        # post-cleanup mesh (GLB)
        textures/       # extracted or generated textures
      skeleton/
        graph.json      # branch graph data
      variations/
        {variation_id}/
          edit-log.json # operation log for this variation
          mesh.glb      # baked variation mesh (optional cache)
```

### Storage Rules

- Original uploads are never modified or deleted during processing.
- Intermediate artifacts are kept for debugging; a background job cleans up after 30 days.
- Cleaned meshes are stored as GLB (glTF Binary) for efficient frontend loading.
- Presigned URLs are used for all client-side uploads and downloads (no proxying through the API).

## Job Pipeline Stages

| Stage | Queue Name | Input | Output | Timeout |
|---|---|---|---|---|
| Photo QA | `photo-qa` | Original photos | QA report, filtered photo list | 5 min |
| Preprocess | `preprocess` | Filtered photos | Processed photos + masks | 10 min |
| Reconstruct | `reconstruct` | Processed photos | Raw mesh | 30 min |
| Cleanup | `cleanup` | Raw mesh | Cleaned GLB | 10 min |
| Skeletonize | `skeletonize` | Cleaned GLB | Branch graph JSON | 5 min |

Jobs support retry with exponential backoff (max 3 attempts). Failed jobs are moved to a dead-letter queue for manual inspection.

## Key Design Decisions

See the [ADR directory](ADRs/) for detailed rationale:

- [ADR-001: System Architecture](ADRs/001-system-architecture.md)
- [ADR-002: Reconstruction Strategy](ADRs/002-reconstruction-strategy.md)
- [ADR-003: Editor Data Model](ADRs/003-editor-data-model.md)
