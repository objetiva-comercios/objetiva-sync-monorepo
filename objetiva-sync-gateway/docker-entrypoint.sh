#!/bin/sh
set -e

# Load persisted config from data/.env (written by setup wizard, survives restarts)
if [ -f "./data/.env" ]; then
  set -a
  . ./data/.env
  set +a
fi

# Skip migrations if DATABASE_URL is not set (setup wizard hasn't run yet)
if [ -n "$DATABASE_URL" ]; then
  echo "Syncing database schema..."
  npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>/dev/null || \
    npx prisma db push --schema=./prisma/schema.prisma
  echo "Schema sync complete."
else
  echo "DATABASE_URL not set — skipping migrations (setup wizard mode)."
fi

exec "$@"
