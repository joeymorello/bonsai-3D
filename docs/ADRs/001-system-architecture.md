# ADR-001: System Architecture

## Status

Accepted

## Date

2026-04-07

## Context

We need to choose a technology stack for bonsai-3D, a web application that reconstructs 3D bonsai models from photos and provides interactive editing tools. The system must handle:

- A rich, interactive 3D editing experience in the browser.
- An API layer for workspace management, job orchestration, and data persistence.
- Computationally intensive reconstruction and skeleton extraction workloads.
- Storage for photos, meshes, textures, and edit data.
- Asynchronous job processing with progress tracking.

## Decision

We adopt the following architecture:

### Frontend: React + Three.js (via React Three Fiber)

- React 18 for UI components with Zustand for state management.
- React Three Fiber for declarative Three.js integration.
- Vite for fast development and optimized production builds.

### API: Node.js with TypeScript (Fastify)

- Fastify for high-performance HTTP and WebSocket handling.
- TypeScript with strict mode for type safety across the stack.
- Drizzle ORM for type-safe database queries.
- BullMQ for job queue production (enqueuing jobs for Python services).

### Reconstruction Services: Python (FastAPI)

- Python for access to the richest ecosystem of 3D processing libraries (Open3D, trimesh, scipy, scikit-image).
- FastAPI for HTTP endpoints consumed by the job pipeline.
- Separate services for reconstruction and skeleton extraction to allow independent scaling.

### Data Layer: PostgreSQL + Redis + S3

- **PostgreSQL 16**: Relational data (users, workspaces, jobs, variations metadata). Chosen for reliability, JSON support, and strong ecosystem.
- **Redis 7**: BullMQ job queues, session caching, and pub/sub for WebSocket fan-out. Chosen for speed and BullMQ compatibility.
- **S3-compatible storage** (MinIO locally, AWS S3 in production): All binary assets (photos, meshes, textures). Chosen for cost-effective scalable blob storage with presigned URL support.

## Alternatives Considered

### Unity/Unreal for the editor

Rejected. Requires a downloadable client, limiting accessibility. Web-based Three.js provides sufficient 3D editing capability for our use case (branch manipulation, not full CAD modeling).

### Python-only backend (Django/Flask)

Rejected. Node.js with TypeScript provides better WebSocket support, shares types with the frontend, and handles high-concurrency I/O-bound API traffic more efficiently. Python is used where it excels: numerical computation and 3D processing.

### Single monolithic backend

Rejected. Reconstruction workloads have very different resource profiles (GPU, high memory) from API serving (I/O bound, low memory). Separating them allows independent scaling and deployment.

### MongoDB instead of PostgreSQL

Rejected. Our data model has clear relational structure (workspaces -> photos -> jobs -> variations). PostgreSQL's JSONB columns provide document flexibility where needed without sacrificing relational integrity.

## Consequences

- **Positive**: Type safety across frontend and API via shared TypeScript packages. Rich 3D library ecosystem in Python. Independent scaling of API and compute services. Cost-effective blob storage.
- **Negative**: Two language runtimes to maintain (Node.js + Python). Inter-service communication adds operational complexity. Team needs proficiency in both TypeScript and Python.
- **Mitigations**: Shared type definitions in `packages/shared/` reduce drift. Docker Compose simplifies local development. CI enforces linting and type checking for both languages.
