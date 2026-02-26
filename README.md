# Objetiva Sync Monorepo

Sistema de sincronización ETL (Extract-Transform-Load) que extrae datos desde sistemas ERP (SQL Server, PostgreSQL) y los centraliza en una base de datos PostgreSQL a través de un API Gateway REST. Diseñado para empresas que necesitan consolidar información de artículos, comprobantes y pagos desde múltiples orígenes hacia un único repositorio de datos confiable. El sistema incluye un dashboard web para configuración de consultas, monitoreo en tiempo real y gestión de sincronizaciones.

## Tecnologías

| Categoría | Tecnología |
|---|---|
| Lenguaje | TypeScript 5.7 |
| Runtime | Node.js 20+ |
| Framework HTTP | Fastify 5 |
| ORM (Sync) | Drizzle ORM + SQLite (better-sqlite3) |
| ORM (Gateway) | Prisma + PostgreSQL |
| Validación | Zod |
| Autenticación | JWT (@fastify/jwt) + bcrypt |
| Frontend (Sync) | HTMX + EJS + Tailwind CSS |
| Frontend (Gateway) | React 18 + Vite + Tailwind CSS |
| Iconos | Lucide React |
| Logging | Pino |
| Métricas | prom-client (Prometheus) |
| Scheduling | node-cron |
| Testing | Vitest |
| Monorepo | npm workspaces |

## Requisitos previos

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 14 (para el Gateway)
- **SQL Server** (como origen de datos ERP, opcional si se usa PostgreSQL como origen)

## Instalación

1. Clonar el repositorio:
   ```bash
   git clone <url-del-repositorio>
   cd objetiva-sync-monorepo
   ```

2. Instalar dependencias de todos los workspaces:
   ```bash
   npm install
   ```

3. Copiar los archivos de configuración:
   ```bash
   cp objetiva-sync/.env.example objetiva-sync/.env
   cp objetiva-sync-gateway/.env.example objetiva-sync-gateway/.env
   ```

4. Configurar las variables de entorno en cada `.env` (ver sección [Configuración](#configuración)).

5. Preparar la base de datos del Gateway:
   ```bash
   cd objetiva-sync-gateway
   npx prisma db push
   npm run prisma:generate
   ```

6. Iniciar los servicios:
   ```bash
   # Terminal 1 - Gateway (debe arrancar primero)
   cd objetiva-sync-gateway
   npm run dev

   # Terminal 2 - Sync
   cd objetiva-sync
   npm run dev
   ```

7. Acceder al wizard de configuración del Gateway en `http://localhost:3335/setup` y al dashboard del Sync en `http://localhost:3000`.

## Configuración

### objetiva-sync/.env

```env
# Servidor
PORT=3000
NODE_ENV=development

# Base de datos local (SQLite)
DATABASE_PATH=./database/objetiva-sync.db

# Seguridad (se auto-generan en el primer arranque si se dejan vacíos)
ENCRYPTION_KEY=
SESSION_SECRET=

# Aplicación
APP_NAME=Objetiva Sync
ADMIN_PASSWORD=cambiar123
LOG_LEVEL=info
LOG_FILE=./logs/sync.log

# Conexión al Gateway
REMOTE_API_URL=http://localhost:3335
REMOTE_API_USERNAME=admin
REMOTE_API_PASSWORD=tu_password_aqui

# Sincronización
SYNC_INTERVAL_MINUTES=15
BATCH_SIZE=500

# Validación de schemas (debe coincidir con el Gateway)
GATEWAY_URL=http://localhost:3335
JWT_SECRET=tu_jwt_secret_64_hex_chars
SCHEMA_CACHE_TTL_MS=3600000
```

### objetiva-sync-gateway/.env

```env
# Servidor
PORT=3335
NODE_ENV=development
HOST=0.0.0.0

# Base de datos PostgreSQL
DATABASE_URL=postgresql://sync_user:tu_password_aqui@localhost:5432/objetiva_sync_gateway

# JWT (debe coincidir con objetiva-sync)
JWT_SECRET=tu_jwt_secret_64_hex_chars
JWT_EXPIRES_IN=86400

# Autenticación del cliente sync
SYNC_USERNAME=admin
SYNC_PASSWORD=tu_password_aqui

# Logging
LOG_LEVEL=info

# Entidades a sincronizar (vacío = todas las predeterminadas)
SYNC_ENTITIES=
```

> **Nota:** El `JWT_SECRET` debe ser idéntico en ambos servicios. Generarlo con: `openssl rand -hex 32`

## Uso

### objetiva-sync (Motor de sincronización)

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia en modo desarrollo con hot-reload |
| `npm run build` | Compila para producción |
| `npm start` | Ejecuta la build de producción |
| `npm test` | Ejecuta tests con Vitest |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npm run test:e2e` | Tests end-to-end contra ERP real |
| `npm run db:generate` | Genera migraciones de Drizzle |
| `npm run db:migrate` | Ejecuta migraciones de SQLite |
| `npm run db:studio` | Abre Drizzle Studio (inspector de BD) |
| `npm run lint` | Ejecuta ESLint |
| `npm run format` | Formatea código con Prettier |

### objetiva-sync-gateway (API Gateway)

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia en modo desarrollo con hot-reload |
| `npm run build` | Compila TypeScript |
| `npm start` | Ejecuta la build de producción |
| `npm test` | Ejecuta tests con Vitest |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npm run prisma:generate` | Genera el cliente Prisma |
| `npm run prisma:push` | Aplica el schema a PostgreSQL |
| `npm run prisma:migrate` | Crea una migración de Prisma |
| `npm run prisma:studio` | Abre Prisma Studio (inspector visual de BD) |
| `npm run regenerate-schemas` | Regenera schemas Zod y Prisma desde PostgreSQL |
| `npm run regenerate-schemas:dry-run` | Vista previa de la regeneración sin aplicar cambios |

## Arquitectura del proyecto

```
├── objetiva-sync/                    # Motor de extracción y sincronización
│   ├── src/
│   │   ├── adapters/                 # Conectores de BD (SQL Server, PostgreSQL)
│   │   ├── api-client/               # Cliente HTTP para comunicación con el Gateway
│   │   ├── config/                   # Configuración y constantes
│   │   ├── dashboard/                # Dashboard web (HTMX + EJS)
│   │   │   ├── routes/               # Rutas HTTP (API y vistas)
│   │   │   ├── static/               # Assets CSS/JS
│   │   │   └── views/                # Templates EJS
│   │   ├── services/                 # Lógica de negocio (auth, sync)
│   │   ├── store/                    # Acceso a datos SQLite (Drizzle)
│   │   ├── sync/                     # Motor de sync, scheduler, batch processor
│   │   ├── types/                    # Definiciones de tipos TypeScript
│   │   └── utils/                    # Logger, crypto, helpers
│   ├── database/                     # Archivos SQLite (gitignored)
│   ├── tests/                        # Tests (unit, integration, e2e)
│   └── package.json
│
├── objetiva-sync-gateway/            # API Gateway + persistencia PostgreSQL
│   ├── src/
│   │   ├── lib/                      # Utilidades (logger, Prisma, métricas, auth)
│   │   ├── middleware/               # JWT auth, manejo de errores, CORS
│   │   ├── routes/                   # Endpoints de ingesta, auth y salud
│   │   ├── services/                 # Lógica de ingesta (upserts)
│   │   └── app.ts / server.ts        # Setup y arranque de Fastify
│   ├── dashboard/                    # Dashboard React (Vite + Tailwind)
│   │   └── src/components/           # Componentes de monitoreo
│   ├── prisma/
│   │   ├── schema.prisma             # Modelos PostgreSQL
│   │   └── migrations/               # Historial de migraciones
│   ├── tests/                        # Tests (unit, integration)
│   └── package.json
│
├── shared/                           # Código compartido entre servicios
│   ├── schemas/
│   │   └── generated/                # Schemas Zod auto-generados desde PostgreSQL
│   │       ├── articulos.schema.ts
│   │       ├── comprobantes_cabecera.schema.ts
│   │       ├── comprobantes_detalle.schema.ts
│   │       └── comprobantes_pagos.schema.ts
│   └── types/                        # Tipos compartidos (EntityMetadata)
│
└── package.json                      # Configuración del monorepo (workspaces)
```

## API / Endpoints

El Gateway expone los siguientes endpoints en el puerto `3335`:

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Autenticación con usuario y contraseña, devuelve JWT |
| POST | `/api/auth/refresh` | Renueva un token JWT próximo a expirar |
| GET | `/api/auth/diagnostics` | Diagnóstico del estado de autenticación |

### Ingesta de datos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/batch/:entityType` | Ingesta de un lote de registros para una entidad |
| GET | `/api/schemas` | Obtiene los schemas de validación vigentes |
| GET | `/api/schemas/:entityType` | Schema de validación para una entidad específica |

### Monitoreo

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de salud del servicio |
| GET | `/metrics` | Métricas en formato Prometheus |
| GET | `/api/stats` | Estadísticas de sincronización |
| GET | `/api/logs` | Logs recientes en formato JSON |

### Dashboard

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Dashboard de monitoreo (React) |
| GET | `/setup` | Wizard de configuración inicial |

## Scripts y automatización

### Regeneración de schemas

Cuando la estructura de PostgreSQL cambia, los schemas Zod y modelos Prisma deben regenerarse:

```bash
cd objetiva-sync-gateway
npm run regenerate-schemas          # Aplica los cambios
npm run regenerate-schemas:dry-run  # Vista previa sin aplicar
```

Este comando introspecciona PostgreSQL y actualiza los archivos en `shared/schemas/generated/` y `prisma/schema.prisma`.

### Sincronización programada

El motor de sincronización usa `node-cron` para ejecutar extracciones periódicas. El intervalo se configura con la variable `SYNC_INTERVAL_MINUTES` o desde el dashboard web en `http://localhost:3000`.

### Cola de reintentos

Los lotes fallidos se encolan automáticamente con backoff exponencial. El estado de la cola se visualiza y gestiona desde el dashboard del sincronizador.

### Despliegue con Docker

El Gateway incluye configuración Docker para despliegue:

```bash
cd objetiva-sync-gateway
docker compose up -d
```

## Flujo de datos

```
┌──────────────┐         ┌───────────────────┐  HTTP/JWT  ┌────────────────┐
│  SQL Server  │         │   objetiva-sync   │ ─────────► │    Gateway     │
│  PostgreSQL  │ ──SQL──►│   (Extractor)     │            │    (API)       │──► PostgreSQL
│  (ERP)       │         │   :3000           │            │    :3335       │    (destino)
└──────────────┘         └───────────────────┘            └────────────────┘
```

1. El **Scheduler** dispara la sincronización según el cron configurado
2. Los **Adapters** ejecutan las queries SQL contra el ERP origen
3. El **Validator** verifica los datos contra los schemas Zod compartidos
4. El **BatchProcessor** agrupa registros en lotes configurables
5. El **APIClient** envía los lotes al Gateway con autenticación JWT
6. El **Gateway** valida con Zod e inserta/actualiza con Prisma
7. La **RetryQueue** reintenta automáticamente los lotes fallidos

## Entidades sincronizadas

| Entidad | Clave primaria | Descripción |
|---|---|---|
| `articulos` | `erp_codigo` | Catálogo de productos/artículos |
| `comprobantes_cabecera` | `operacion, formulario, numero` | Cabeceras de comprobantes |
| `comprobantes_detalle` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` | Líneas de detalle |
| `comprobantes_pagos` | `comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero` | Registros de pagos |

Todas las entidades incluyen campos de auditoría: `erp_creado`, `erp_actualizado`, `erp_sincronizado`, `erp_fecha_sync`.
