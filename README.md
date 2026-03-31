# Objetiva Sync Monorepo

Sistema de sincronizacion ETL (Extract-Transform-Load) que extrae datos desde sistemas ERP (SQL Server, PostgreSQL, MySQL, Excel) y los centraliza en una base de datos PostgreSQL a traves de un API Gateway REST. Diseñado para empresas que necesitan consolidar informacion de articulos, comprobantes y pagos desde multiples origenes hacia un unico repositorio de datos confiable. Incluye regeneracion distribuida de schemas (Zod + Prisma) desde PostgreSQL remoto, comparacion 3-way de schemas (PostgreSQL live vs gateway compilado vs sync reportado), dashboard web con pagina de Schema Status, wizard de setup guiado y enlace automatico sync-gateway via codigos de pairing.

## Tecnologias

| Categoria | Tecnologia |
|---|---|
| Lenguaje | TypeScript 5.7 |
| Runtime | Node.js >= 20 |
| Framework HTTP | Fastify 5 |
| ORM (Sync) | Drizzle ORM + SQLite (better-sqlite3) |
| ORM (Gateway) | Prisma 6 + PostgreSQL |
| Validacion | Zod 3.23 |
| Autenticacion | JWT (@fastify/jwt + fast-jwt) |
| Frontend (Sync) | HTMX + EJS + Tailwind CSS |
| Frontend (Gateway) | React + Vite |
| Logging | Pino |
| Metricas | prom-client (Prometheus) |
| Scheduling | node-cron |
| Drivers ERP | mssql, msnodesqlv8, pg |
| Testing | Vitest |
| Contenedores | Docker (multi-stage build) |
| Reverse Proxy | Traefik (Gateway) / Nginx (Sync) |
| Rate Limiting | @fastify/rate-limit |
| Monorepo | npm workspaces |

## Requisitos previos

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 14 (para el Gateway)
- **SQL Server** (como origen de datos ERP, opcional segun adaptador)
- **Docker** >= 20.10 + Docker Compose v2 (para despliegue del Gateway)
- **PM2** (para despliegue del Sync: `npm install -g pm2`)

## Instalacion

### Desarrollo local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/objetiva-comercios/objetiva-sync-monorepo.git
   cd objetiva-sync-monorepo
   ```

2. Instalar dependencias de todos los workspaces:
   ```bash
   npm install
   ```

3. Configurar objetiva-sync:
   ```bash
   cp objetiva-sync/.env.example objetiva-sync/.env
   ```
   Editar `objetiva-sync/.env` con los valores del entorno (ver seccion [Configuracion](#configuracion)).

4. Iniciar los servicios:
   ```bash
   # Terminal 1 - Gateway (debe arrancar primero)
   cd objetiva-sync-gateway
   npm run dev

   # Terminal 2 - Sync
   cd objetiva-sync
   npm run dev
   ```

5. Acceder al **wizard de configuracion** del Gateway en `http://localhost:3335/setup`. El asistente de 5 pasos configura base de datos, dominio, JWT y aplica la configuracion, generando el `.env` del gateway automaticamente. No es necesario crear ni editar el `.env` del gateway manualmente.

6. Acceder al dashboard de Sync en `http://localhost:3000`. La conexion al gateway se configura desde **Configuracion > API Remota > Enlazar via codigo** usando el codigo de pairing generado en el paso anterior.

### Despliegue rapido (produccion)

```bash
# Gateway (Docker + Traefik)
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync-gateway/install.sh | bash

# Sync (PM2 + Node.js)
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync/install.sh | bash
```

Ver `DEPLOY.md` para la guia completa de despliegue.

## Configuracion

### objetiva-sync/.env

```env
# Servidor
PORT=3000
NODE_ENV=development

# Base de datos local (SQLite)
DATABASE_PATH=./database/objetiva-sync.db

# Seguridad (se auto-generan en el primer arranque si se dejan vacios)
ENCRYPTION_KEY=
SESSION_SECRET=

# Aplicacion
APP_NAME=Objetiva Sync
ADMIN_PASSWORD=cambiar123
LOG_LEVEL=info
LOG_FILE=./logs/sync.log

# Sincronizacion
SYNC_INTERVAL_MINUTES=15
BATCH_SIZE=500

# Conexion al Gateway (se configura automaticamente via pairing)
GATEWAY_URL=http://localhost:3335
JWT_SECRET=tu_jwt_secret_64_hex_chars
SCHEMA_CACHE_TTL_MS=3600000
```

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `NODE_ENV` | `development` | Entorno de ejecucion |
| `DATABASE_PATH` | `./database/objetiva-sync.db` | Ruta a la base SQLite |
| `ENCRYPTION_KEY` | — | Clave de encriptacion (auto-generada en primer arranque) |
| `SESSION_SECRET` | — | Secret de sesion (auto-generado en primer arranque) |
| `APP_NAME` | `Objetiva Sync` | Nombre mostrado en el dashboard |
| `ADMIN_PASSWORD` | `cambiar123` | Contraseña inicial del admin del dashboard |
| `SYNC_INTERVAL_MINUTES` | `15` | Intervalo entre sincronizaciones (minutos) |
| `BATCH_SIZE` | `500` | Registros por lote enviados al gateway |
| `GATEWAY_URL` | — | URL del gateway (se configura via pairing) |
| `JWT_SECRET` | — | Debe coincidir con el del gateway (se configura via pairing) |

### objetiva-sync-gateway (wizard interactivo)

La configuracion del gateway se realiza a traves del **wizard de setup** accesible en `/setup`. El asistente de 5 pasos configura:

1. **Base de datos** — Conexion a PostgreSQL (host, port, user, password, database)
2. **Dominio** — URL publica del gateway (protocolo + dominio + puerto opcional)
3. **JWT Secret** — Generacion automatica de clave de 64 caracteres hex
4. **Aplicar configuracion** — Escribe el `.env` y recarga la configuracion en caliente
5. **Enlazar Sync** — Genera un codigo de pairing de 6 caracteres para vincular el sync client

No es necesario crear ni editar el `.env` manualmente. El archivo `.env.example` del gateway sirve como referencia de las variables disponibles:

| Variable | Default | Descripcion |
|---|---|---|
| `PORT` | `3335` | Puerto del servidor |
| `HOST` | `0.0.0.0` | Direccion de escucha |
| `NODE_ENV` | `production` | Entorno de ejecucion |
| `DATABASE_URL` | — | URL de conexion PostgreSQL |
| `JWT_SECRET` | — | Secret para firmar tokens JWT (generado por el wizard) |
| `JWT_EXPIRES_IN` | `86400` | Expiracion de tokens en segundos |
| `GATEWAY_PUBLIC_URL` | — | URL publica del gateway (requerida para pairing) |
| `LOG_LEVEL` | `info` | Nivel de logging |
| `APP_NAME` | `Objetiva Sync Gateway` | Nombre mostrado en el wizard |

| Variable | Modulo | Descripcion |
|---|---|---|
| `JWT_SECRET` | Ambos | Debe ser identico en sync y gateway. Se configura automaticamente via pairing |
| `DATABASE_URL` | Gateway | En Docker, usar el hostname del contenedor PostgreSQL (no `localhost`) |
| `GATEWAY_PUBLIC_URL` | Gateway | URL publica accesible desde sync. Requerida para el flujo de pairing |
| `ENCRYPTION_KEY` | Sync | Se auto-genera en el primer arranque. Encripta datos sensibles en SQLite |

### Monorepo root (.env)

Para la regeneracion remota de schemas desde la maquina de desarrollo:

```env
GATEWAY_URL=http://tu-gateway-url:3335
JWT_SECRET=tu_jwt_secret_64_hex_chars
```

| Variable | Descripcion |
|---|---|
| `GATEWAY_URL` | URL del gateway remoto accesible desde la maquina de desarrollo |
| `JWT_SECRET` | Debe coincidir con el JWT_SECRET del gateway |

## Uso

### Monorepo root (regeneracion de schemas)

| Comando | Descripcion |
|---|---|
| `npm run regenerate-schemas` | Regenera schemas Zod y Prisma desde PostgreSQL remoto |
| `npm run regenerate-schemas:dry-run` | Vista previa de cambios sin escribir archivos |

### objetiva-sync (Motor de sincronizacion)

| Comando | Descripcion |
|---|---|
| `npm run dev` | Inicia en modo desarrollo con hot-reload |
| `npm run build` | Compila para produccion |
| `npm start` | Ejecuta la build de produccion |
| `npm test` | Ejecuta tests con Vitest |
| `npm run test:e2e` | Tests end-to-end contra ERP real |
| `npm run db:generate` | Genera migraciones de Drizzle |
| `npm run db:migrate` | Ejecuta migraciones de SQLite |
| `npm run db:studio` | Abre Drizzle Studio (inspector de BD) |

### objetiva-sync-gateway (API Gateway)

| Comando | Descripcion |
|---|---|
| `npm run dev` | Inicia en modo desarrollo con hot-reload |
| `npm run build` | Compila TypeScript |
| `npm start` | Ejecuta la build de produccion |
| `npm test` | Ejecuta tests con Vitest |
| `npm run prisma:generate` | Genera el cliente Prisma |
| `npm run prisma:push` | Aplica el schema a PostgreSQL |
| `npm run prisma:migrate` | Crea una migracion de Prisma |
| `npm run prisma:studio` | Abre Prisma Studio (inspector visual de BD) |

### Docker (Gateway)

| Comando | Descripcion |
|---|---|
| `docker compose build --no-cache` | Construir imagen desde cero |
| `docker compose up -d` | Iniciar en background |
| `docker compose logs -f sync-gateway` | Ver logs en tiempo real |
| `docker compose restart sync-gateway` | Reiniciar servicio |
| `curl http://localhost:3335/health` | Verificar salud |
| `curl http://localhost:3335/metrics` | Metricas Prometheus |

## Arquitectura del proyecto

```
├── objetiva-sync/                    # Motor de extraccion y sincronizacion
│   ├── src/
│   │   ├── adapters/                 # Conectores de BD (SQL Server, PostgreSQL, MySQL, Excel)
│   │   │   ├── sqlserver/            # Adaptador SQL Server (mssql + msnodesqlv8)
│   │   │   ├── postgresql/           # Adaptador PostgreSQL (pg)
│   │   │   ├── adapter-pool.ts       # Pool de conexiones multi-origen
│   │   │   └── base-adapter.ts       # Clase base con logica compartida
│   │   ├── api-client/               # Cliente HTTP para comunicacion con el Gateway
│   │   ├── config/                   # Configuracion y constantes
│   │   ├── dashboard/                # Dashboard web (HTMX + EJS)
│   │   │   ├── routes/               # Rutas HTTP (API y vistas)
│   │   │   ├── static/               # Assets CSS/JS
│   │   │   └── views/                # Templates EJS
│   │   ├── services/                 # Logica de negocio (auth, schema-cache)
│   │   ├── store/                    # Acceso a datos SQLite (Drizzle)
│   │   │   ├── schema.ts             # Esquema de tablas
│   │   │   ├── repositories/         # Patron repository
│   │   │   └── migrations/           # Migraciones Drizzle
│   │   ├── sync/                     # Motor de sync, scheduler, batch processor
│   │   │   ├── sync-engine.ts        # Orquestador principal
│   │   │   ├── batch-processor.ts    # Procesamiento por lotes
│   │   │   ├── query-validator.ts    # Validacion de queries contra schema
│   │   │   ├── sync-state-manager.ts # Tracking de estado incremental
│   │   │   └── retry-queue-manager.ts # Cola de reintentos
│   │   ├── types/                    # Definiciones de tipos TypeScript
│   │   └── utils/                    # Logger, crypto, helpers
│   ├── tests/                        # Tests (unit, integration, e2e)
│   └── database/                     # Archivos SQLite (gitignored)
│
├── objetiva-sync-gateway/            # API Gateway + persistencia PostgreSQL
│   ├── src/
│   │   ├── codegen/                  # Introspection PostgreSQL -> Zod/Prisma
│   │   ├── config/                   # Entidades y configuracion
│   │   ├── lib/                      # Utilidades (logger, Prisma, metricas)
│   │   ├── middleware/               # JWT auth, manejo de errores
│   │   ├── routes/                   # Endpoints (ingesta, schemas, setup, pairing)
│   │   ├── services/                 # Logica de ingesta, pairing, schema comparison
│   │   ├── utils/                    # Env writer, system state
│   │   └── app.ts / server.ts        # Setup y arranque de Fastify
│   ├── dashboard/                    # React SPA (Schema Status, metricas)
│   ├── prisma/
│   │   ├── schema.prisma             # Modelos PostgreSQL (auto-generado)
│   │   └── migrations/               # Historial de migraciones
│   ├── Dockerfile                    # Build multi-stage (3 etapas, ~200MB)
│   ├── docker-compose.yml            # Despliegue con Traefik
│   └── tests/                        # Tests (unit, integration)
│
├── shared/                           # Codigo compartido entre servicios
│   ├── schemas/
│   │   ├── index.ts                  # Exports de todos los schemas generados
│   │   └── generated/                # Schemas Zod auto-generados desde PostgreSQL
│   │       ├── articulos.schema.ts
│   │       ├── comprobantes_cabecera.schema.ts
│   │       ├── comprobantes_detalle.schema.ts
│   │       └── comprobantes_pagos.schema.ts
│   └── types/                        # Tipos compartidos (EntityMetadata, SchemaMetadata)
│
├── scripts/
│   └── regenerate-schemas.ts         # CLI de regeneracion distribuida de schemas
│
└── package.json                      # Configuracion del monorepo (workspaces)
```

## API / Endpoints

El Gateway expone los siguientes endpoints en el puerto `3335`:

### Ingesta de datos

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/batch/:entityType` | Ingesta de un lote de registros para una entidad |
| GET | `/api/schemas` | Obtiene los schemas de validacion vigentes |
| GET | `/api/schemas/:entityType` | Schema de validacion para una entidad especifica |

### Comparacion de schemas

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/schemas/compare` | Comparacion 3-way: PostgreSQL live vs gateway compilado vs sync reportado |
| POST | `/api/schemas/report` | Sync reporta sus schemas actuales al gateway |

La comparacion 3-way permite detectar desalineamientos entre las 3 capas del sistema. La pagina Schema Status del dashboard del gateway consume estos endpoints para visualizar el estado de alineacion por entidad y por campo.

### Setup y pairing

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/setup` | Wizard de configuracion inicial (5 pasos) |
| GET | `/api/setup/preflight` | Checklist de validacion pre-vuelo |
| GET | `/api/setup/status` | Estado actual de la configuracion |
| POST | `/api/setup/test-db` | Prueba conexion a PostgreSQL |
| POST | `/api/setup/save-domain` | Guarda URL publica del gateway |
| POST | `/api/setup/save-jwt` | Guarda JWT secret |
| POST | `/api/setup/apply-config` | Aplica configuracion al .env |
| POST | `/api/setup/token` | Genera token JWT post-configuracion |
| POST | `/api/pairing/generate` | Genera codigo de pairing (6 chars, 10 min TTL) |
| POST | `/api/pairing/claim` | Consume codigo y devuelve credenciales (rate-limited) |

### Monitoreo

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/health` | Estado de salud del servicio (200 ok / 503 degraded) |
| GET | `/metrics` | Metricas en formato Prometheus |
| GET | `/api/stats` | Estadisticas de sincronizacion |
| GET | `/api/logs` | Logs recientes en formato JSON |

### Autenticacion

La autenticacion entre sync y gateway es via JWT con shared secret (`JWT_SECRET`). El sync genera tokens localmente usando `fast-jwt` — no hay endpoints de login. El `JWT_SECRET` se transfiere automaticamente durante el flujo de pairing.

## Scripts y automatizacion

### Regeneracion de schemas

Cuando la estructura de PostgreSQL cambia (columna nueva, tipo modificado, columna eliminada), los schemas Zod y modelos Prisma deben regenerarse. El comando se ejecuta desde la raiz del monorepo:

```bash
# Vista previa de cambios (sin escribir archivos)
npm run regenerate-schemas:dry-run

# Aplicar cambios
npm run regenerate-schemas
```

El script conecta al gateway remoto via HTTP con JWT, introspecciona PostgreSQL, genera los schemas Zod en `shared/schemas/generated/` y el schema Prisma en `objetiva-sync-gateway/prisma/schema.prisma`, y ejecuta `prisma generate` automaticamente.

El ciclo completo de deploy tras un cambio en PostgreSQL se documenta en la Seccion 10 de `objetiva-sync-gateway/DEPLOY.md`.

### Sincronizacion programada

El motor de sincronizacion usa `node-cron` para ejecutar extracciones periodicas. El intervalo se configura con la variable `SYNC_INTERVAL_MINUTES` o desde el dashboard web en `http://localhost:3000`. Soporta sincronizacion incremental con tracking de timestamps por entidad y proteccion de clock skew (5 minutos de overlap).

### Cola de reintentos

Los lotes fallidos se encolan automaticamente con backoff exponencial (1s, 2s, 4s, 8s, 16s). El estado de la cola se visualiza y gestiona desde el dashboard del sincronizador.

## Docker

El Gateway se despliega como contenedor Docker detras de Traefik. La imagen usa un build multi-stage de 3 etapas (deps → builder → runtime, ~200MB final).

```bash
cd objetiva-sync-gateway
docker compose build --no-cache && docker compose up -d
```

El contenedor ejecuta migraciones de Prisma automaticamente en cada inicio (idempotente). Al iniciar por primera vez sin `.env`, arranca en modo setup wizard.

Servicios definidos en `docker-compose.yml`:

| Servicio | Imagen | Puerto interno | Red | Health check |
|---|---|---|---|---|
| sync-gateway | Build local (multi-stage) | 3335 | sanchez_docker_network | `GET /health` cada 30s |

El contenedor no expone puertos directamente — Traefik rutea via labels de Docker. Limite de memoria: 512MB. Logs persistidos via Docker named volume.

Ver `objetiva-sync-gateway/DEPLOY.md` para la guia detallada con Traefik, Tailscale y troubleshooting.

## Deploy

El monorepo tiene dos servicios que se despliegan de forma independiente:

| Servicio | Metodo | Dominio |
|---|---|---|
| Gateway | Docker Compose + Traefik | `sync-gateway.sanchezrepuestos.com.ar` |
| Sync | PM2 + Nginx | `sync.sanchezrepuestos.com.ar` |

### Instalacion rapida en VPS

```bash
# Gateway
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync-gateway/install.sh | bash

# Sync
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync/install.sh | bash
```

Ambos scripts son idempotentes, preservan `.env` y base de datos en reinstalaciones.

### Flujo de setup completo

1. Instalar Gateway → completar wizard en `/setup`
2. Reiniciar Gateway (ejecuta migraciones Prisma)
3. Generar codigo de pairing (paso 5 del wizard)
4. Instalar Sync → crear `.env`
5. Enlazar desde Dashboard Sync → Configuracion > API Remota → ingresar codigo de pairing
6. La sincronizacion inicia automaticamente segun el intervalo configurado

Ver `DEPLOY.md` en la raiz del proyecto para la guia completa de despliegue con arquitectura, variables, DNS y troubleshooting.

## Flujo de datos

```
┌──────────────┐         ┌───────────────────┐  HTTP/JWT  ┌────────────────┐
│  SQL Server  │         │   objetiva-sync   │ ─────────► │    Gateway     │
│  PostgreSQL  │ ──SQL──►│   (Extractor)     │            │    (API)       │──► PostgreSQL
│  (ERP)       │         │   :3000           │            │    :3335       │    (destino)
└──────────────┘         └───────────────────┘            └────────────────┘
```

1. El **Scheduler** dispara la sincronizacion segun el cron configurado
2. Los **Adapters** ejecutan las queries SQL contra el ERP origen
3. El **Validator** verifica los datos contra los schemas Zod compartidos
4. El **BatchProcessor** agrupa registros en lotes configurables
5. El **APIClient** envia los lotes al Gateway con autenticacion JWT (token generado localmente con shared secret)
6. El **Gateway** valida con Zod e inserta/actualiza con Prisma (origin tracking)
7. La **RetryQueue** reintenta automaticamente los lotes fallidos

## Flujo de setup y pairing

```
┌──────────────────┐                          ┌──────────────────┐
│  Gateway /setup  │                          │  Sync Dashboard  │
│  (wizard 5 pasos)│                          │  Config > API    │
└────────┬─────────┘                          └────────┬─────────┘
         │                                             │
         │  1. Configura DB, dominio, JWT              │
         │  2. Aplica .env                             │
         │  3. Genera codigo de 6 chars ──────────────►│
         │                                             │  4. Ingresa codigo + URL
         │      5. POST /api/pairing/claim ◄───────────│
         │      6. Devuelve JWT_SECRET + config ───────►│
         │                                             │  7. Guarda config en SQLite
         │                                             │  8. Test de conexion automatico
         └─────────────────────────────────────────────┘
```

## Entidades sincronizadas

| Entidad | Clave primaria | Descripcion |
|---|---|---|
| `articulos` | `erp_codigo` | Catalogo de productos/articulos |
| `comprobantes_cabecera` | `operacion, formulario, numero` | Cabeceras de comprobantes |
| `comprobantes_detalle` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` | Lineas de detalle |
| `comprobantes_pagos` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` | Registros de pagos |

Todas las entidades incluyen campos de auditoria (`erp_creado`, `erp_actualizado`, `erp_sincronizado`, `erp_fecha_sync`) y campos de origin tracking (`origin_source`, `origin_sync_id`, `origin_synced_at`) para soporte multi-origen.

## Estado del proyecto

Milestone actual: **v1.3 Distributed Schema Regeneration** — 5 de 5 fases completadas, 10 requirements verificados, closure-ready (2026-03-30).

Milestones anteriores: v1.0 (2026-02-03), v1.1-rc (2026-02-05), v1.1-rc2 (2026-02-18), v1.2 (2026-03-16).

Pendiente: verificacion humana end-to-end con cambios reales en PostgreSQL y datos de produccion.
