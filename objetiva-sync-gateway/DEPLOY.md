# Objetiva Sync Gateway - Guia de Deployment con Docker

## Requisitos

- **Docker** >= 20.10 con Docker Compose v2
- **Git** (para sparse checkout)
- **PostgreSQL** accesible desde la red Docker (ej: corriendo en un contenedor en `sanchez_docker_network`)

## 1. Clonar con Sparse Checkout

Descarga solo los archivos necesarios para el gateway (~5% del repo):

```bash
git clone --filter=blob:none --sparse https://github.com/YOUR_ORG/objetiva-sync-monorepo.git
cd objetiva-sync-monorepo

git sparse-checkout set --skip-checks \
  shared/ \
  objetiva-sync-gateway/
```

> Si ya tienes un clon completo, salta este paso.

## 2. Configurar Entorno

```bash
cd objetiva-sync-gateway
cp .env.example .env
```

Editar `.env` y configurar todas las variables. Las mas importantes para Docker:

| Variable | Valor Docker | Notas |
|----------|-------------|-------|
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db` | Usar hostname del contenedor PostgreSQL, NO `localhost` |
| `JWT_SECRET` | resultado de `openssl rand -hex 32` | Debe coincidir con el del sincronizador |
| `SYNC_USERNAME` | `admin` | Usuario para autenticacion del sincronizador |
| `SYNC_PASSWORD` | tu contraseña | Contraseña en texto plano para el sincronizador |
| `HOST` | `0.0.0.0` | Escuchar en todas las interfaces dentro del contenedor |
| `NODE_ENV` | `production` | |

Ver `.env.example` para la documentacion completa de cada variable.

## 3. Construir e Iniciar

```bash
docker compose build --no-cache && docker compose up -d
```

Verificar que esta corriendo:

```bash
# Estado del contenedor
docker compose ps

# Health check
curl http://localhost:3335/health

# Ver logs
docker compose logs -f sync-gateway
```

## 4. Actualizar

Desde el directorio `objetiva-sync-gateway/`:

```bash
git pull
docker compose build --no-cache && docker compose up -d
```

Las migraciones de Prisma se ejecutan automaticamente en cada inicio del contenedor (idempotente).

## 5. Integracion con Traefik (Opcional)

Si el VPS usa Traefik como proxy reverso, descomentar los labels en `docker-compose.yml` y configurar el dominio:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sync-gateway.rule=Host(`gateway.tudominio.com`)"
  - "traefik.http.routers.sync-gateway.entrypoints=websecure"
  - "traefik.http.routers.sync-gateway.tls.certresolver=letsencrypt"
  - "traefik.http.services.sync-gateway.loadbalancer.server.port=3335"
```

Asegurarse de que el contenedor y Traefik compartan la misma red Docker.

## 6. Monitoreo y Troubleshooting

```bash
# Estado del contenedor
docker compose ps

# Logs en tiempo real
docker compose logs -f sync-gateway

# Shell dentro del contenedor
docker compose exec sync-gateway sh

# Reiniciar
docker compose restart sync-gateway

# Reconstruir sin cache
docker compose build --no-cache && docker compose up -d

# Metricas Prometheus
curl http://localhost:3335/metrics
```

### Problemas Comunes

**El contenedor se detiene inmediatamente:**
Revisar logs con `docker compose logs sync-gateway`. Generalmente es una variable `.env` faltante o incorrecta.

**Conexion a base de datos rechazada:**
Verificar que `DATABASE_URL` use el hostname del contenedor PostgreSQL (no `localhost`). Ambos contenedores deben estar en la misma red Docker (`sanchez_docker_network`).

**Las migraciones fallan:**
Verificar que la base de datos exista y el usuario tenga permisos. Revisar `docker compose logs sync-gateway` para ver la salida de Prisma.

## 7. Migracion desde PM2

Si se esta migrando desde el deployment anterior con PM2:

1. Detener PM2: `pm2 stop sync-gateway && pm2 delete sync-gateway`
2. El contenedor Docker usa la misma base de datos, no se necesita migrar datos
3. Asegurarse de que `DATABASE_URL` en `.env` apunte al host correcto (hostname del contenedor en vez de `localhost`)

## Notas de Arquitectura

- **Build multi-stage:** deps -> builder -> runtime (~200MB imagen final)
- **El entrypoint ejecuta migraciones:** `prisma migrate deploy` en cada inicio (idempotente)
- **Limite de memoria:** 512MB (configurable en `docker-compose.yml`)
- **Health check:** endpoint `/health`, verificado cada 30s
- **Logs:** persistidos via Docker named volume `gateway-logs`
