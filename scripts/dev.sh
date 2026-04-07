#!/usr/bin/env bash
set -euo pipefail

# Start infra if not running
docker compose -f infra/docker/docker-compose.yml up -d

# Start all dev servers
pnpm dev
