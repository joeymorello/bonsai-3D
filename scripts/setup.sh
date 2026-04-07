#!/usr/bin/env bash
set -euo pipefail

echo "=== bonsai-3D local dev setup ==="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Node.js is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required. Install: npm i -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Copy env files if they don't exist
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env 2>/dev/null || true
  echo "Created apps/api/.env"
fi

# Start infrastructure
echo "Starting Docker services..."
docker compose -f infra/docker/docker-compose.yml up -d

# Wait for postgres
echo "Waiting for Postgres..."
until docker compose -f infra/docker/docker-compose.yml exec -T postgres pg_isready -U postgres 2>/dev/null; do
  sleep 1
done

# Wait for Redis
echo "Waiting for Redis..."
until docker compose -f infra/docker/docker-compose.yml exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  sleep 1
done

# Run DB migrations
echo "Running database migrations..."
cd apps/api && pnpm db:push && cd ../..

echo ""
echo "=== Setup complete! ==="
echo "Start dev servers: pnpm dev"
echo "MinIO console: http://localhost:9001 (minioadmin/minioadmin)"
echo "API: http://localhost:3001"
echo "Web: http://localhost:5173"
