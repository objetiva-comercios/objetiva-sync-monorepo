# =============================================================================
# Objetiva Sync Gateway - Multi-stage Docker Build
# =============================================================================
# Build context must be the MONOREPO ROOT (npm workspaces need root lockfile).
#
#   docker build -f objetiva-sync-gateway/Dockerfile .
#
# Or via docker compose from the gateway directory:
#   docker compose up -d --build
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install all dependencies (cached unless package.json/lockfile change)
# ---------------------------------------------------------------------------
FROM node:20-slim AS deps

WORKDIR /app

# Copy root workspace manifest and lockfile
COPY package.json package-lock.json ./

# Copy workspace package.json files needed by npm ci
COPY shared/package.json shared/package.json
COPY objetiva-sync-gateway/package.json objetiva-sync-gateway/package.json

# Create stub for objetiva-sync workspace (in lockfile but not needed for gateway build)
RUN mkdir -p objetiva-sync && \
    echo '{"name":"objetiva-sync","version":"1.0.0","private":true}' > objetiva-sync/package.json

# Only install deps for the workspaces we need (skip objetiva-sync's native deps like msnodesqlv8)
RUN npm ci -w shared -w objetiva-sync-gateway

# ---------------------------------------------------------------------------
# Stage 2: Compile everything
# ---------------------------------------------------------------------------
FROM deps AS builder

# --- Shared package: compile TS -> JS alongside source ---
# The exports map in shared/package.json points to .js files (e.g. ./schemas/index.js)
# so we emit JS into the same directory with --outDir .
COPY shared/schemas shared/schemas
COPY shared/types shared/types
COPY shared/tsconfig.json shared/tsconfig.json

RUN cd shared && npx tsc -p tsconfig.json --outDir .

# --- Prisma: generate client and stage to known path ---
COPY objetiva-sync-gateway/prisma objetiva-sync-gateway/prisma

RUN cd objetiva-sync-gateway && npx prisma generate && \
    mkdir -p /tmp/prisma-client && \
    (cp -r /app/node_modules/.prisma/client /tmp/prisma-client/ 2>/dev/null || \
     cp -r /app/objetiva-sync-gateway/node_modules/.prisma/client /tmp/prisma-client/)

# --- Dashboard: install deps and build React SPA ---
COPY objetiva-sync-gateway/dashboard objetiva-sync-gateway/dashboard

RUN cd objetiva-sync-gateway/dashboard && npm install && npm run build

# --- Gateway: compile TypeScript ---
COPY objetiva-sync-gateway/src objetiva-sync-gateway/src
COPY objetiva-sync-gateway/tsconfig.json objetiva-sync-gateway/tsconfig.json

RUN cd objetiva-sync-gateway && npx tsc

# ---------------------------------------------------------------------------
# Stage 3: Lean production runtime
# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

# Prisma needs openssl for the query engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Re-create the workspace structure for production npm ci
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY objetiva-sync-gateway/package.json objetiva-sync-gateway/package.json

RUN mkdir -p objetiva-sync && \
    echo '{"name":"objetiva-sync","version":"1.0.0","private":true}' > objetiva-sync/package.json

# Install production deps only for gateway workspaces, then add prisma CLI for migrations
RUN npm ci --omit=dev -w shared -w objetiva-sync-gateway && \
    npm install --no-save prisma

# Copy Prisma generated client to both possible resolution paths
COPY --from=builder /tmp/prisma-client/client node_modules/.prisma/client
COPY --from=builder /tmp/prisma-client/client objetiva-sync-gateway/node_modules/.prisma/client

# Copy compiled shared package (.js files alongside .ts source)
COPY --from=builder /app/shared/schemas shared/schemas
COPY --from=builder /app/shared/types shared/types

# Copy compiled gateway
COPY --from=builder /app/objetiva-sync-gateway/dist objetiva-sync-gateway/dist

# Copy dashboard static build
COPY --from=builder /app/objetiva-sync-gateway/dashboard/dist objetiva-sync-gateway/dashboard/dist

# Copy Prisma schema and migrations (needed by migrate deploy)
COPY --from=builder /app/objetiva-sync-gateway/prisma objetiva-sync-gateway/prisma

# Copy entrypoint script
COPY objetiva-sync-gateway/docker-entrypoint.sh objetiva-sync-gateway/docker-entrypoint.sh
RUN chmod +x objetiva-sync-gateway/docker-entrypoint.sh

# Create logs directory
RUN mkdir -p objetiva-sync-gateway/logs

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 gateway && \
    chown -R gateway:nodejs objetiva-sync-gateway/logs

USER gateway
WORKDIR /app/objetiva-sync-gateway

EXPOSE 3335

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3335/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
