#!/bin/bash
set -euo pipefail

echo "========================================="
echo "  Bonsai-3D Database Seed"
echo "========================================="
echo ""

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-bonsai3d}"
DB_USER="${DB_USER:-bonsai}"
DB_PASSWORD="${DB_PASSWORD:-bonsai_dev}"

export PGPASSWORD="$DB_PASSWORD"

echo "Connecting to $DB_NAME at $DB_HOST:$DB_PORT..."
echo ""

# Check connection
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo "ERROR: Cannot connect to PostgreSQL. Is it running?"
    echo "  Run: ./scripts/setup.sh"
    exit 1
fi

echo "Seeding test data..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
-- This is a placeholder seed script.
-- Tables will be created by Drizzle migrations.
-- Once the schema is in place, uncomment and adapt:

-- INSERT INTO users (id, email, name, created_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'dev@bonsai3d.local',
--   'Dev User',
--   NOW()
-- ) ON CONFLICT (id) DO NOTHING;

-- INSERT INTO workspaces (id, user_id, name, status, created_at, updated_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000010',
--   '00000000-0000-0000-0000-000000000001',
--   'Sample Bonsai',
--   'created',
--   NOW(),
--   NOW()
-- ) ON CONFLICT (id) DO NOTHING;

SELECT 'Seed script executed (placeholder — no tables yet)' AS result;
SQL

echo ""
echo "Seed complete."
echo ""
