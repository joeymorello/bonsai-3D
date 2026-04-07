#!/bin/bash
set -euo pipefail

echo "========================================="
echo "  Bonsai-3D Development Setup"
echo "========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 20+."
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v pnpm &> /dev/null; then
    echo "ERROR: pnpm is not installed. Run: npm install -g pnpm"
    exit 1
fi
echo "  pnpm: $(pnpm --version)"

if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker."
    exit 1
fi
echo "  Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"

if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
    echo "ERROR: Docker Compose is not available."
    exit 1
fi
echo "  Docker Compose: available"

echo ""
echo "All prerequisites met."
echo ""

# Install dependencies
echo "Installing dependencies..."
pnpm install
echo ""

# Start infrastructure services
echo "Starting infrastructure services..."
COMPOSE_FILE="$(dirname "$0")/../infra/docker/docker-compose.yml"

if docker compose version &> /dev/null; then
    docker compose -f "$COMPOSE_FILE" up -d
else
    docker-compose -f "$COMPOSE_FILE" up -d
fi
echo ""

# Wait for services to be ready
echo "Waiting for services to be ready..."

echo -n "  PostgreSQL..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U bonsai -d bonsai3d &> /dev/null; then
        echo " ready"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo " timeout (may still be starting)"
    fi
    sleep 1
done

echo -n "  Redis..."
for i in $(seq 1 15); do
    if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping &> /dev/null; then
        echo " ready"
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo " timeout (may still be starting)"
    fi
    sleep 1
done

echo -n "  MinIO..."
for i in $(seq 1 15); do
    if curl -sf http://localhost:9000/minio/health/live &> /dev/null; then
        echo " ready"
        break
    fi
    if [ "$i" -eq 15 ]; then
        echo " timeout (may still be starting)"
    fi
    sleep 1
done

echo ""

# Run DB migrations placeholder
echo "Running database migrations..."
echo "  (placeholder — migrations will run when the schema is defined)"
echo ""

# Done
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Services running:"
echo "  PostgreSQL:    localhost:5432  (db: bonsai3d, user: bonsai)"
echo "  Redis:         localhost:6379"
echo "  MinIO:         localhost:9000  (console: localhost:9001)"
echo "  MinIO creds:   minioadmin / minioadmin"
echo ""
echo "Next steps:"
echo "  pnpm dev          — start all dev servers"
echo "  pnpm dev:api      — start API server only"
echo "  pnpm dev:web      — start web frontend only"
echo "  pnpm dev:worker   — start background worker only"
echo ""
