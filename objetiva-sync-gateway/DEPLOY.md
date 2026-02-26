# Objetiva Sync Gateway - Docker Deployment Guide

## Prerequisites

- **Docker** >= 20.10 with Docker Compose v2
- **Git** (for sparse checkout)
- **PostgreSQL** accessible from the Docker network (e.g., running in a container on `sanchez_docker_network`)

## 1. Clone with Sparse Checkout

Only download the files needed for the gateway (~5% of the repo):

```bash
git clone --filter=blob:none --sparse https://github.com/YOUR_ORG/objetiva-sync-monorepo.git
cd objetiva-sync-monorepo

git sparse-checkout set \
  package.json \
  package-lock.json \
  .dockerignore \
  shared/ \
  objetiva-sync-gateway/
```

> If you already have a full clone, skip this step.

## 2. Configure Environment

```bash
cd objetiva-sync-gateway
cp .env.example .env
```

Edit `.env` and set all required variables. Key Docker-specific settings:

| Variable | Docker value | Notes |
|----------|-------------|-------|
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db` | Use container hostname, NOT `localhost` |
| `HOST` | `0.0.0.0` | Listen on all interfaces inside container |
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | `openssl rand -hex 32` | Generate a secure random string |

## 3. Build and Start

```bash
docker compose up -d --build
```

This builds the multi-stage Docker image and starts the container. First build takes 2-3 minutes; subsequent builds use cache and are much faster.

Verify it's running:

```bash
# Check container status
docker compose ps

# Check health
curl http://localhost:3335/health

# View logs
docker compose logs -f sync-gateway
```

## 4. Update Workflow

```bash
git pull
docker compose up -d --build
```

Prisma migrations run automatically on each container start (idempotent).

## 5. Traefik Integration (Optional)

If your VPS uses Traefik as reverse proxy, uncomment the labels in `docker-compose.yml` and set your domain:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sync-gateway.rule=Host(`gateway.yourdomain.com`)"
  - "traefik.http.routers.sync-gateway.entrypoints=websecure"
  - "traefik.http.routers.sync-gateway.tls.certresolver=letsencrypt"
  - "traefik.http.services.sync-gateway.loadbalancer.server.port=3335"
```

Ensure the container and Traefik share the same Docker network.

## 6. Monitoring and Troubleshooting

```bash
# Container status
docker compose ps

# Real-time logs
docker compose logs -f sync-gateway

# Shell into container
docker compose exec sync-gateway sh

# Restart
docker compose restart sync-gateway

# Rebuild from scratch (no cache)
docker compose build --no-cache && docker compose up -d

# Prometheus metrics
curl http://localhost:3335/metrics
```

### Common Issues

**Container exits immediately:**
Check logs with `docker compose logs sync-gateway`. Usually a missing or incorrect `.env` variable.

**Database connection refused:**
Ensure `DATABASE_URL` uses the PostgreSQL container hostname (not `localhost`). Both containers must be on the same Docker network (`sanchez_docker_network`).

**Migrations fail:**
Check that the database exists and the user has permissions. Run `docker compose logs sync-gateway` to see the Prisma migration output.

## 7. Migration from PM2 Deployment

If migrating from the previous bare-metal PM2 setup:

1. Stop PM2: `pm2 stop sync-gateway && pm2 delete sync-gateway`
2. The Docker container uses the same database, so no data migration is needed
3. Ensure the `.env` `DATABASE_URL` points to the correct host (container hostname instead of `localhost`)
4. Old files (`deploy.sh`, `ecosystem.config.js`, `nginx/`) are preserved for reference but are no longer used

## Architecture Notes

- **Multi-stage build:** deps -> builder -> runtime (~200MB final image)
- **Entrypoint runs migrations:** `prisma migrate deploy` on every start (idempotent)
- **Memory limit:** 512MB (configurable in `docker-compose.yml`)
- **Health check:** `/health` endpoint, checked every 30s
- **Logs:** persisted via Docker named volume `gateway-logs`
