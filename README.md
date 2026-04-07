# bonsai-3D

Web application for reconstructing 3D bonsai models from photographs, with interactive branch editing, pruning simulation, and style variation tools.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Three.js / React Three Fiber, Zustand |
| API | Node.js with TypeScript (Fastify) |
| Reconstruction | Python services (FastAPI, Open3D, trimesh) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 (BullMQ job queue) |
| Object Storage | S3-compatible (MinIO local, AWS S3 prod) |

## Monorepo Structure

```
bonsai-3D/
  apps/
    web/            # React + Three.js frontend
    api/            # Node.js/TypeScript API server
  services/
    recon/          # Python reconstruction pipeline
    skeleton/       # Python skeleton extraction service
  packages/
    shared/         # Shared TypeScript types and utilities
    editor-core/    # Branch graph, deformation, edit ops
    three-utils/    # Three.js helpers and custom shaders
  infra/            # Docker, Terraform, CI configs
  scripts/          # Dev and build scripts
  docs/             # Architecture, ADRs, QA docs
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Python >= 3.11
- Docker and Docker Compose

### Setup

```bash
# Install JS/TS dependencies
pnpm install

# Start Postgres, Redis, MinIO
docker compose up -d

# Run database migrations
pnpm --filter api migrate

# Start all services in dev mode
pnpm dev
```

The web app will be available at `http://localhost:5173` and the API at `http://localhost:3000`.

### Running Tests

```bash
# TypeScript tests (vitest)
pnpm test

# Python tests (pytest)
cd services/recon && pytest
cd services/skeleton && pytest
```

## Architecture Overview

See [docs/architecture.md](docs/architecture.md) for the full system architecture, data flow, and storage strategy.

Additional documentation:

- [Reconstruction Pipeline](docs/reconstruction-pipeline.md)
- [Editor Data Model](docs/editor-data-model.md)
- [Roadmap](docs/roadmap.md)
- [QA Acceptance Tests](docs/qa/acceptance-tests.md)
- [ADRs](docs/ADRs/)

## License

Proprietary. All rights reserved.
