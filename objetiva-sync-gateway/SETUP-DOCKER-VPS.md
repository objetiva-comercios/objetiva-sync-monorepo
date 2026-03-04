# Setup Docker en VPS

Guia para instalar objetiva-sync-gateway en un VPS con Docker, descargando solo los archivos necesarios del monorepo.

## Requisitos

- Docker >= 20.10 con Docker Compose v2
- Git
- PostgreSQL accesible desde la red Docker
- Traefik como reverse proxy (ya configurado en el VPS)
- Tailscale (el servicio se publica detras del tunel)

## 1. Clonar solo lo necesario (sparse checkout)

```bash
git clone --filter=blob:none --sparse https://github.com/objetiva-comercios/objetiva-sync-monorepo.git
cd objetiva-sync-monorepo

git sparse-checkout set --skip-checks \
  shared/ \
  objetiva-sync-gateway/
```

Esto descarga solo `shared/` y `objetiva-sync-gateway/` mas los archivos raiz (`package.json`, `package-lock.json`). No descarga `objetiva-sync/` ni su historial.

## 2. Configurar el .env

```bash
cd objetiva-sync-gateway
cp .env.example .env
nano .env
```

Variables criticas para Docker:

| Variable | Valor | Notas |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db` | Usar hostname del contenedor PostgreSQL, NO `localhost` |
| `JWT_SECRET` | resultado de `openssl rand -hex 32` | Debe coincidir con el del sincronizador |
| `SYNC_USERNAME` | `admin` | Usuario para autenticacion del sincronizador |
| `SYNC_PASSWORD` | tu contraseña | Contraseña en texto plano |
| `HOST` | `0.0.0.0` | Escuchar en todas las interfaces dentro del contenedor |
| `NODE_ENV` | `production` | |

## 3. Crear la red Docker (si no existe)

```bash
docker network create sanchez_docker_network
```

Traefik y sync-gateway deben estar en esta misma red.

## 4. Construir y levantar

```bash
docker compose build --no-cache && docker compose up -d
```

## 5. Verificar

```bash
# Estado del contenedor
docker compose ps

# Health check
curl http://localhost:3335/health

# Logs en tiempo real
docker compose logs -f sync-gateway
```

## Actualizar

```bash
git pull
docker compose build --no-cache && docker compose up -d
```

Las migraciones de Prisma se ejecutan automaticamente en cada inicio del contenedor (idempotente).

## Traefik + Tailscale

El `docker-compose.yml` ya tiene los labels de Traefik configurados para `sync-gateway.sanchezrepuestos.com.ar` en HTTP. Se usa HTTP porque Let's Encrypt no puede completar el challenge HTTP-01 detras de Tailscale. El trafico viaja cifrado por el tunel.

El DNS del subdominio debe apuntar a la IP de Tailscale del servidor.
