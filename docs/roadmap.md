# Roadmap

## M0 -- Foundation

- Monorepo setup (pnpm, Turborepo, TypeScript, ESLint, Prettier)
- Docker Compose for Postgres, Redis, MinIO
- CI pipeline (lint, typecheck, test)
- Basic Fastify API scaffold with health check
- Database schema v1 (workspaces, photos, jobs)
- S3 upload/download utilities with presigned URLs

## M1 -- Photo Upload and QA

- Workspace creation UI and API
- Multi-photo upload with drag-and-drop
- Photo QA service: blur detection, duplicate filtering, exposure check
- QA report display in the frontend
- Coverage analysis with gap warnings

## M2 -- Reconstruction Pipeline

- Meshy API integration (upload, poll, download)
- BullMQ job pipeline: QA -> preprocess -> reconstruct -> cleanup
- Job progress tracking via WebSocket
- Preprocessing service: normalize, resize, segment, mask
- Cleanup service: scale, align, decimate
- Raw and cleaned mesh storage in S3

## M3 -- 3D Viewer

- React Three Fiber viewport with orbit controls
- GLB model loading from S3 presigned URLs
- Trunk/foliage material separation
- Lighting and environment setup
- Screenshot/thumbnail capture

## M4 -- Skeleton Extraction and Branch Editor

- Skeleton extraction service (Laplacian contraction, graph simplification)
- Branch graph visualization overlay in the 3D viewport
- Mesh-to-skeleton binding
- Edit operations: bend, rotate, translate
- Skeletal deformation with real-time mesh update
- Undo/redo stack

## M5 -- Pruning and Styling

- Prune operation with visual clipper tool
- Foliage cluster detection and adjustment controls
- Radius scaling and tapering tools
- Style presets (formal upright, informal upright, slanting, cascade)
- Before/after comparison view

## M6 -- Variations and Export

- Variation creation, forking, and management UI
- Edit log persistence and replay
- Side-by-side variation comparison
- Export to GLB, OBJ, STL
- Shareable read-only viewer links

## M7 -- R&D Track

- Hunyuan3D-2 integration and quality benchmarking
- TRELLIS evaluation for single/few-shot reconstruction
- Self-hosted GPU pipeline for reconstruction
- COLMAP fallback implementation
- Quality comparison tooling (Meshy vs. open-source outputs)
