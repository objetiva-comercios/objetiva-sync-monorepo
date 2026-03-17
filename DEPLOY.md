# Deploy — Objetiva Sync Monorepo

Sistema compuesto por dos servicios independientes que se despliegan por separado:

| Servicio | Metodo | Puerto | Dominio |
|----------|--------|--------|---------|
| **Gateway** | Docker Compose + Traefik | 3335 | `sync-gateway.sanchezrepuestos.com.ar` |
| **Sync** | PM2 + Nginx | 3000 | `sync.sanchezrepuestos.com.ar` |

---

## Instalacion rapida

### Gateway (Docker)

```bash
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync-gateway/install.sh | bash
```

### Sync (PM2)

```bash
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync/install.sh | bash
```

> Ambos scripts son idempotentes: se pueden ejecutar multiples veces sin romper nada. Preservan el `.env` existente en reinstalaciones.

---

## Requisitos

### Gateway

- Docker >= 20.10 con Docker Compose v2
- Git
- PostgreSQL accesible desde la red Docker
- Traefik corriendo en `sanchez_docker_network`

### Sync

- Node.js >= 20
- npm
- PM2 (`npm install -g pm2`)
- Nginx (para exponer con SSL)
- Git

---

## Arquitectura de deployment

```
                                    ┌─────────────────────────────┐
                                    │         VPS / Servidor      │
                                    │                             │
 ┌─────────────┐                    │  ┌───────────────────────┐  │
 │  ERP origen  │ ────SQL──────────►│  │   objetiva-sync       │  │
 │  (SQL Server)│                   │  │   PM2 + Node.js       │  │
 └─────────────┘                    │  │   :3000                │  │
                                    │  └──────────┬────────────┘  │
                                    │             │ HTTP/JWT       │
                                    │             ▼               │
                                    │  ┌───────────────────────┐  │
                                    │  │   sync-gateway        │  │
                                    │  │   Docker + Traefik    │  │
                                    │  │   :3335 (interno)     │──┼──► PostgreSQL
                                    │  └───────────────────────┘  │    (destino)
                                    │                             │
                                    │  ┌───────────────────────┐  │
                                    │  │   Traefik             │  │
                                    │  │   Reverse proxy       │  │
                                    │  │   :80 / :443          │  │
                                    │  └───────────────────────┘  │
                                    └─────────────────────────────┘
```

### Redes

- **sanchez_docker_network**: Red Docker externa donde conviven Traefik, el Gateway y PostgreSQL
- **Nginx**: Reverse proxy para el servicio Sync (corre fuera de Docker, con PM2)
- **Tailscale**: Tunel VPN para acceso seguro al VPS sin exponer puertos publicos

---

## 1. Deploy del Gateway

### Que hace el install.sh

1. Verifica dependencias (git, docker, docker compose)
2. Clona el repo con sparse checkout (solo `shared/` + `objetiva-sync-gateway/`)
3. Preserva `.env` existente si hay reinstalacion
4. Crea la red Docker `sanchez_docker_network` si no existe
5. Construye la imagen Docker (multi-stage, ~200MB)
6. Levanta el contenedor en modo setup wizard
7. Muestra la URL para completar la configuracion

### Post-instalacion

1. Acceder al wizard: `http://sync-gateway.sanchezrepuestos.com.ar/setup`
2. Completar los 6 pasos (DB, dominio, JWT, password, aplicar, pairing)
3. Reiniciar para ejecutar migraciones: `docker compose restart sync-gateway`

### Variables de entorno (Gateway)

| Variable | Descripcion | Default | Requerida |
|----------|-------------|---------|-----------|
| `PORT` | Puerto del servidor | `3335` | No |
| `HOST` | Direccion de escucha | `0.0.0.0` | No |
| `NODE_ENV` | Entorno de ejecucion | `production` | No |
| `DATABASE_URL` | URL de conexion PostgreSQL | — | Si |
| `JWT_SECRET` | Secret para firmar tokens JWT | — | Si |
| `JWT_EXPIRES_IN` | Expiracion de tokens (segundos) | `86400` | No |
| `SYNC_USERNAME` | Usuario para autenticacion | `admin` | No |
| `SYNC_PASSWORD` | Contraseña del sync client | — | Si |
| `GATEWAY_PUBLIC_URL` | URL publica del gateway | — | Si |
| `LOG_LEVEL` | Nivel de logging | `info` | No |

> No es necesario crear `.env` manualmente. El wizard lo genera automaticamente.

### Traefik

El contenedor no expone puertos directamente. Traefik rutea internamente via labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sync-gateway.rule=Host(`sync-gateway.sanchezrepuestos.com.ar`)"
  - "traefik.http.routers.sync-gateway.entrypoints=web"
  - "traefik.http.services.sync-gateway.loadbalancer.server.port=3335"
```

Se usa HTTP (entrypoint `web`) porque el trafico viaja cifrado por el tunel Tailscale. Let's Encrypt no puede completar el challenge HTTP-01 detras de Tailscale.

### Comandos utiles (Gateway)

```bash
cd ~/proyectos/objetiva-sync-monorepo/objetiva-sync-gateway

# Estado
docker compose ps

# Logs en tiempo real
docker compose logs -f sync-gateway

# Reiniciar
docker compose restart sync-gateway

# Reconstruir desde cero
docker compose build --no-cache && docker compose up -d

# Health check
docker compose exec sync-gateway node -e "fetch('http://localhost:3335/health').then(r=>r.json()).then(console.log)"

# Metricas Prometheus
docker compose exec sync-gateway node -e "fetch('http://localhost:3335/metrics').then(r=>r.text()).then(console.log)"

# Shell dentro del contenedor
docker compose exec sync-gateway sh

# Detener
docker compose down
```

Ver `objetiva-sync-gateway/DEPLOY.md` para la guia completa con troubleshooting detallado.

---

## 2. Deploy del Sync

### Que hace el install.sh

1. Verifica dependencias (git, node >= 20, npm, pm2)
2. Clona el repo con sparse checkout (solo `shared/` + `objetiva-sync/`)
3. Preserva `.env` existente si hay reinstalacion
4. Instala dependencias (`npm ci`)
5. Compila TypeScript (`npm run build`)
6. Crea directorios de base de datos y logs
7. Ejecuta migraciones Drizzle
8. Inicia/recarga el servicio con PM2
9. Ejecuta health check

### Variables de entorno (Sync)

| Variable | Descripcion | Default | Requerida |
|----------|-------------|---------|-----------|
| `PORT` | Puerto del servidor | `3000` | Si |
| `NODE_ENV` | Entorno de ejecucion | `production` | Si |
| `DATABASE_PATH` | Ruta a la base SQLite | `./database/objetiva-sync.db` | Si |
| `ENCRYPTION_KEY` | Clave de encriptacion (auto-generada) | — | No |
| `SESSION_SECRET` | Secret de sesion (auto-generado) | — | No |
| `APP_NAME` | Nombre de la aplicacion | `Objetiva Sync` | No |
| `ADMIN_PASSWORD` | Contraseña inicial del admin | `cambiar123` | Si |
| `REMOTE_API_URL` | URL del Gateway | — | No |
| `REMOTE_API_USERNAME` | Usuario para el Gateway | `admin` | No |
| `REMOTE_API_PASSWORD` | Contraseña para el Gateway | — | No |
| `SYNC_INTERVAL_MINUTES` | Intervalo de sincronizacion | `30` | No |
| `BATCH_SIZE` | Registros por lote | `100` | No |
| `GATEWAY_URL` | URL del Gateway para schemas | — | No |
| `JWT_SECRET` | Debe coincidir con el Gateway | — | No |

### Configurar `.env` (primera vez)

```bash
cd ~/proyectos/objetiva-sync-monorepo/objetiva-sync
cp .env.example .env
nano .env  # editar con los valores correctos
```

### Nginx (reverse proxy para Sync)

Copiar la configuracion incluida:

```bash
sudo cp ~/proyectos/objetiva-sync-monorepo/objetiva-sync/nginx/objetiva-sync.conf /etc/nginx/sites-available/objetiva-sync
sudo ln -sf /etc/nginx/sites-available/objetiva-sync /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Generar certificado SSL:

```bash
sudo certbot --nginx -d sync.sanchezrepuestos.com.ar
```

> La config de Nginx incluye `proxy_buffering off` y timeouts largos (600s), necesarios para SSE (Server-Sent Events) del streaming de sincronizacion.

### Comandos utiles (Sync)

```bash
cd ~/proyectos/objetiva-sync-monorepo/objetiva-sync

# Estado
pm2 list

# Logs en tiempo real
pm2 logs objetiva-sync

# Reiniciar
pm2 restart objetiva-sync

# Detener
pm2 stop objetiva-sync

# Monitoreo (CPU, memoria)
pm2 monit

# Dashboard
# http://localhost:3000 o http://sync.sanchezrepuestos.com.ar
```

---

## Red y acceso

### Configurar DNS

**Opcion A: Tailscale (recomendado)**

Agregar en el archivo hosts de tu maquina:

```
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts
<IP-TAILSCALE-DEL-VPS>    sync-gateway.sanchezrepuestos.com.ar
<IP-TAILSCALE-DEL-VPS>    sync.sanchezrepuestos.com.ar
```

Para obtener la IP Tailscale del VPS:

```bash
tailscale ip -4
```

**Opcion B: DNS publico**

Crear registros A en tu proveedor DNS:

```
Tipo: A  |  Nombre: sync-gateway  |  Valor: <IP publica del VPS>
Tipo: A  |  Nombre: sync          |  Valor: <IP publica del VPS>
```

**Opcion C: Desarrollo local**

- Gateway: Descomentar `ports: - "3335:3335"` en `docker-compose.yml` → `http://localhost:3335`
- Sync: Acceder directo a `http://localhost:3000`

---

## Actualizacion

### Gateway

```bash
cd ~/proyectos/objetiva-sync-monorepo/objetiva-sync-gateway
git pull
docker compose up -d --build
```

Las migraciones de Prisma se ejecutan automaticamente en cada inicio (idempotente). El `.env` se preserva.

### Sync

```bash
cd ~/proyectos/objetiva-sync-monorepo/objetiva-sync
git pull
npm ci --production=false
npm run build
npx drizzle-kit migrate
pm2 restart objetiva-sync
```

O simplemente re-ejecutar el install.sh:

```bash
bash ~/proyectos/objetiva-sync-monorepo/objetiva-sync/install.sh
```

---

## Flujo de setup completo (primera vez)

1. **Instalar Gateway**: `curl ... | bash` → wizard en `/setup` → configurar DB, JWT, password
2. **Reiniciar Gateway**: `docker compose restart sync-gateway` (ejecuta migraciones)
3. **Generar codigo de pairing**: Paso 6 del wizard (codigo de 6 caracteres, 10 min TTL)
4. **Instalar Sync**: `curl ... | bash` → crear `.env` con datos basicos
5. **Enlazar Sync al Gateway**: Dashboard Sync → Configuracion > API Remota → ingresar codigo de pairing + URL del gateway
6. **Verificar**: La sincronizacion deberia empezar automaticamente segun el intervalo configurado

---

## Servicios

| Servicio | Tipo | Puerto | Health | Metricas |
|----------|------|--------|--------|----------|
| sync-gateway | Docker | 3335 | `GET /health` | `GET /metrics` |
| objetiva-sync | PM2 | 3000 | `pm2 list` | — |
| PostgreSQL | Docker/externo | 5432 | — | — |
| Traefik | Docker | 80/443 | — | — |
| Nginx | Sistema | 80/443 | `nginx -t` | — |

---

## Troubleshooting

### Gateway no arranca

```bash
docker compose logs --tail 30 sync-gateway
```

- **"DATABASE_URL environment variable is required"**: Imagen vieja, reconstruir con `--no-cache`
- **Queda en Restarting**: Revisar logs, tipicamente problema de conexion a DB
- **No se puede acceder a `/setup`**: Verificar que Traefik este corriendo en la misma red

### Sync no arranca

```bash
pm2 logs objetiva-sync --lines 30
```

- **".env file not found"**: Crear desde `.env.example`
- **"Missing required environment variables"**: Completar PORT, NODE_ENV, DATABASE_PATH
- **Build falla**: Verificar Node.js >= 20 y que `npm ci` se completo sin errores

### Conexion Sync → Gateway falla

1. Verificar que `REMOTE_API_URL` apunte al Gateway correcto
2. Verificar que `JWT_SECRET` sea identico en ambos servicios
3. Verificar que la red permite la conexion (firewall, Tailscale)
4. Probar: `curl http://sync-gateway.sanchezrepuestos.com.ar/health`

### Migraciones fallan

- **Prisma (Gateway)**: Verificar permisos del usuario PostgreSQL (`CREATE TABLE`)
- **Drizzle (Sync)**: Verificar que el directorio de `DATABASE_PATH` exista y tenga permisos de escritura

---

## Estructura relevante al deploy

```
objetiva-sync-monorepo/
├── DEPLOY.md                              # ← Este archivo
├── objetiva-sync-gateway/
│   ├── Dockerfile                         # Build multi-stage (3 etapas, ~200MB)
│   ├── docker-compose.yml                 # Despliegue con Traefik
│   ├── docker-entrypoint.sh               # Migraciones Prisma en arranque
│   ├── .env.example                       # Variables de entorno
│   ├── install.sh                         # Instalador automatico (curl | bash)
│   ├── DEPLOY.md                          # Guia detallada del Gateway
│   └── prisma/
│       ├── schema.prisma                  # Schema PostgreSQL
│       └── migrations/                    # Historial de migraciones
├── objetiva-sync/
│   ├── .env.example                       # Variables de entorno
│   ├── deploy.sh                          # Script de deploy local
│   ├── install.sh                         # Instalador automatico (curl | bash)
│   ├── ecosystem.config.js                # Configuracion PM2
│   └── nginx/
│       └── objetiva-sync.conf             # Config Nginx con SSE
└── shared/                                # Schemas Zod compartidos
```
