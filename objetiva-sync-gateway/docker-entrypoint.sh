#!/bin/sh
set -e

# Skip migrations if DATABASE_URL is not set (setup wizard hasn't run yet)
if [ -n "$DATABASE_URL" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy --schema=./prisma/schema.prisma
  echo "Migrations complete."
else
  echo "DATABASE_URL not set — skipping migrations (setup wizard mode)."
fi

exec "$@"
