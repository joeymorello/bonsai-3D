# AGENTS.md -- Instructions for AI Agents

This file provides context and conventions for AI agents working on the bonsai-3D codebase.

## Monorepo Layout

This is a pnpm workspace monorepo managed by Turborepo.

- **apps/web/** -- React + Three.js frontend (Vite, React 18, R3F, Zustand)
- **apps/api/** -- Node.js API server (Fastify, TypeScript, Drizzle ORM)
- **services/recon/** -- Python reconstruction pipeline (FastAPI, Open3D, trimesh)
- **services/skeleton/** -- Python skeleton extraction (FastAPI, topology algorithms)
- **packages/shared/** -- Shared TypeScript types, constants, and validation schemas (Zod)
- **packages/editor-core/** -- Branch graph data structures, deformation math, edit operations
- **packages/three-utils/** -- Three.js helpers, custom shaders, camera rigs
- **infra/** -- Docker Compose, Dockerfiles, Terraform, CI/CD configs
- **scripts/** -- Dev tooling, seed scripts, migration helpers

## Dev Environment

```bash
pnpm install                # install all JS/TS deps
docker compose up -d        # start Postgres, Redis, MinIO
pnpm dev                    # start all apps/services via Turborepo
```

Python services have their own virtualenvs managed via `requirements.txt` in each service directory. Create with:

```bash
cd services/recon && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

## Key Conventions

### TypeScript

- **Strict mode** is enabled in `tsconfig.base.json` -- do not disable `strict`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.
- Use **Zod** for runtime validation at API boundaries.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- No `any` -- use `unknown` and narrow with type guards.

### Formatting and Linting

- **Prettier** handles all formatting. Do not manually adjust whitespace.
- **ESLint** with the flat config in `eslint.config.js`. Fix all lint errors before committing.
- Run `pnpm lint` and `pnpm format:check` to verify.

### Python

- Target Python 3.11+.
- Use type hints everywhere.
- Format with **Black**, lint with **Ruff**.
- Each service has its own `pyproject.toml`.

### Naming

- Files: `kebab-case.ts`, `kebab-case.py`
- React components: `PascalCase.tsx`
- Database tables: `snake_case`
- API routes: `kebab-case` paths, e.g. `/api/workspaces/:id/reconstruct`

## Testing

- **TypeScript**: vitest. Tests live next to source files as `*.test.ts` / `*.test.tsx`.
- **Python**: pytest. Tests live in `tests/` directories within each service.
- Run all tests: `pnpm test` (TS) or `pytest` (Python, from service directory).
- Aim for test coverage on business logic and data transformations. UI snapshot tests are optional.

## Branch Naming

- `feature/<short-description>` -- new functionality
- `fix/<short-description>` -- bug fixes
- `chore/<short-description>` -- deps, CI, tooling, docs
- `refactor/<short-description>` -- code restructuring without behavior change

## PR Requirements

- PRs must target `main`.
- Include a descriptive title and summary of changes.
- All CI checks must pass (lint, typecheck, test).
- At least one approval required before merge.
- Squash merge preferred; keep a clean commit message.
- If the PR changes the API contract, update the relevant types in `packages/shared/`.
- If the PR changes the reconstruction pipeline, include before/after screenshots or mesh comparisons.

## Important Files

- `turbo.json` -- Turborepo pipeline config
- `pnpm-workspace.yaml` -- workspace package list
- `tsconfig.base.json` -- shared TypeScript config
- `eslint.config.js` -- shared ESLint config
- `docker-compose.yml` -- local infrastructure services
- `docs/ADRs/` -- architectural decision records (read before making structural changes)
