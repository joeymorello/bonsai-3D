# Bonsai-3D Project Conventions

## Architecture

This is a **pnpm monorepo** managed with **Turborepo**.

- **TypeScript** strict mode throughout, with **Prettier** and **ESLint** for formatting/linting.
- **Backend (`apps/api`):** Fastify + Drizzle ORM + Postgres
- **Frontend (`apps/web`):** Vite + React + Three.js (react-three-fiber) + Zustand + TanStack Query + Tailwind CSS v4
- **Worker (`apps/worker`):** BullMQ + Redis
- **Python service (`services/python`):** FastAPI + trimesh + rembg

## Local Development

Local dev uses **Docker Compose** for infrastructure services (Postgres, Redis, MinIO):

```sh
pnpm docker:up    # start containers
pnpm docker:down  # stop containers
```

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers in parallel |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm setup` | Run initial project setup script |
| `pnpm clean` | Clean build artifacts |

## Database

Migrations use Drizzle Kit:

```sh
cd apps/api && pnpm db:push       # push schema to database
cd apps/api && pnpm db:generate   # generate migration files
```

Or from the project root:

```sh
pnpm db:push
pnpm db:generate
```

## Ports

| Service | Port |
|---------|------|
| API | 3001 |
| Web | 5173 |
| Python service | 8000 |
