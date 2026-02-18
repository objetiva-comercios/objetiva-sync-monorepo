# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Monorepo with two specialized applications following a unidirectional data synchronization pattern with modular layering.

**Key Characteristics:**
- **Pull-based ETL architecture**: Objetivo Sync extracts from ERPs via adapters, transforms, and pushes to Gateway
- **Query-driven synchronization**: Configuration-based SQL queries define what data syncs (not code-driven)
- **Adapter pattern**: Pluggable data source adapters (SQL Server, PostgreSQL, MySQL, Excel)
- **Event-driven scheduling**: Query-based job scheduling with retry queues and batch processing
- **Separation of concerns**: Sync engine (source) separate from ingestion service (destination)

## Layers

**Presentation Layer (Objetivo Sync):**
- Purpose: Web dashboard for configuration, monitoring, and manual sync control
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard`
- Contains: HTMX-powered HTML views, API routes for dashboard, static assets
- Depends on: Store, Auth Service, Sync Engine
- Used by: Administrators, operators for UI interactions

**Configuration Layer:**
- Purpose: Manages all system configuration and environment variables
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/config`
- Contains: Environment loading, constants, secrets management
- Depends on: dotenv
- Used by: All other layers during startup

**Adapter Layer (Objective Sync):**
- Purpose: Abstracts data source connectivity (Strategy pattern)
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters`
- Contains: `IDataSourceAdapter` interface, SQLServerAdapter implementation, base-adapter, database utilities
- Depends on: mssql, better-sqlite3, Zod validation
- Used by: SyncEngine for source data extraction

**API Client Layer (Objective Sync):**
- Purpose: HTTP client for Gateway API communication with authentication
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/api-client`
- Contains: AuthManager, ArticulosClient, ComprobantesCabeceraClient, ComprobantesDetalleClient, ComprobantesPagosClient
- Depends on: undici (HTTP), JWT management
- Used by: SyncEngine to push processed data to Gateway

**Sync Engine Layer (Objective Sync):**
- Purpose: Orchestrates entire synchronization workflow
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync`
- Contains: SyncEngine, BatchProcessor, Scheduler, QueryValidator, RetryQueueManager, SyncStateManager
- Depends on: Adapter Layer, API Client Layer, Store Layer
- Used by: Dashboard routes, scheduled jobs, manual sync triggers

**Data Access Layer (Store):**
- Purpose: SQLite database persistence for configuration and state
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store`
- Contains: Drizzle ORM schema, repositories (config, connection-config, queries, sync-state, retry-queue, sync-logs, notification-config)
- Depends on: drizzle-orm, better-sqlite3
- Used by: All layers for state and configuration persistence

**Auth Layer (Objective Sync):**
- Purpose: User authentication and session management
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/services/auth-service.ts`
- Contains: Password hashing, user creation, session validation
- Depends on: bcrypt, fastify-session
- Used by: Dashboard routes via middleware

**Ingestion Layer (Gateway):**
- Purpose: Receives sync batches and persists to PostgreSQL
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/services/ingestion.ts`
- Contains: IngestionService with upsert logic for articulos, comprobantes-cabecera, comprobantes-detalle, comprobantes-pagos
- Depends on: Prisma ORM, logger
- Used by: API routes for batch ingestion

**API Gateway Layer:**
- Purpose: HTTP REST API for receiving batches and providing status/setup endpoints
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src`
- Contains: Routes (auth, articulos, comprobantes, setup, status), middleware (auth, error-handler)
- Depends on: Fastify, JWT, Prisma, IngestionService
- Used by: External systems submitting sync data

**Utilities Layer:**
- Purpose: Logging, cryptography, helpers, batch storage
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils`
- Contains: logger.ts, crypto.ts, helpers.ts, batch-storage.ts
- Depends on: pino, crypto module
- Used by: All layers for common operations

## Data Flow

**Query-Based Sync Flow (Primary):**

1. **Configuration Phase**
   - Admin configures connection in dashboard
   - Stores in `connection_config` table with encrypted credentials
   - Creates SQL query in `queries` table with `entityType`, `incrementalField`, `lastSync` tracking

2. **Extraction Phase**
   - Scheduler reads scheduled queries from `queries` table (where `isScheduled=true`)
   - SyncEngine loads connection config from `connection_config`
   - Creates adapter instance (e.g., SQLServerAdapter)
   - Executes SQL query with `:lastSync` parameter substitution
   - Adapter returns `IQueryResult` with rows and execution time

3. **Validation & Transformation Phase**
   - QueryValidator validates each row against Zod schema for entity type
   - Transforms row field names (ERP column names → canonical API field names)
   - Builds strongly-typed payload objects (ArticuloPayload, ComprobanteCabeceraPayload, etc.)

4. **Batching Phase**
   - BatchProcessor chunks validated payloads using configured `batchSize`
   - Saves each batch to JSON files in `/logs` directory (optional, for debugging)
   - Tracks batch metadata (batchNumber, totalBatches, progress percentage)

5. **API Push Phase**
   - APIClient authenticates with Gateway (`/auth/login`)
   - Sends each batch to appropriate Gateway endpoint:
     - `POST /api/articulos/batch` for articulos
     - `POST /api/comprobantes/cabecera/batch` for cabeceras
     - `POST /api/comprobantes/detalle/batch` for detalles
     - `POST /api/comprobantes/pagos/batch` for pagos
   - Includes sync metadata in headers: `X-Sync-ID`, `X-Query-ID`, `X-Query-Name`, `X-Batch-Number`, `X-Total-Batches`

6. **Confirmation Phase**
   - API response includes: `{ inserted, updated, errors }`
   - Evaluates confirmation policy:
     - `strict`: batch confirmed only if 0 errors
     - `lenient`: batch confirmed if at least 1 record OK
   - Updates `sync_state` table with `lastSync` timestamp for incremental next run

7. **Retry Logic Phase**
   - On batch failure, RetryQueueManager enqueues to `retry_queue` table
   - Exponential backoff: 1s, 2s, 4s, 8s, 16s (configurable max retries)
   - Automatic retry job scheduled to process queue

8. **State Tracking**
   - SyncStateManager maintains `sync_state` table with:
     - Entity type and query ID
     - Last sync timestamp (for incremental runs)
     - Total items synced, errors count, last error
   - SyncLogsRepo records complete run in `sync_logs` table

**Manual Sync Flow:**
- Admin clicks "Sync Now" in dashboard for specific query
- Dashboard route calls `SyncEngine.sync(queryId, SyncOptions)`
- Same flow as Query-Based but immediate execution instead of scheduled

**Ingestion Flow (Gateway):**

1. Gateway receives batch at `POST /api/[entity]/batch` with Bearer token
2. JWT middleware validates authentication
3. IngestionService receives strongly-typed payloads
4. For each record:
   - Looks up existing record (by `erp_codigo` or unique key)
   - INSERT if new, UPDATE if exists
   - Catches and collects errors without failing batch
5. Returns `{ inserted, updated, errors }`
6. jobTracker aggregates batch metadata across all batches of a sync job
7. On last batch, marks sync job as complete in job history

**Schema Validation Flow:**

El sistema implementa validación dual de queries contra schemas derivados de PostgreSQL:

1. **Obtención del Schema**
   - Dashboard (queries.ts) solicita schema al Gateway
   - Endpoint: `GET /api/schemas/:tableName` (tableName en plural, ej: `articulos`)
   - Gateway consulta metadata de PostgreSQL (`information_schema.columns`)
   - Retorna: `{ tableName, columns: [{ name, type, nullable, hasDefault }] }`

2. **Validación Zod (Local)**
   - QueryValidator valida estructura básica con Zod schemas locales
   - Ubicación: `objetiva-sync/src/sync/query-validator.ts`
   - Valida tipos de datos, campos requeridos, formato de valores

3. **Validación contra Schema PostgreSQL (Remota)**
   - SchemaValidator compara campos del query contra columnas de PostgreSQL
   - Ubicación: `objetiva-sync/src/sync/schema-validator.ts`
   - Detecta: campos faltantes, tipos incorrectos, campos inesperados (warning only)

4. **Resultado Combinado**
   - `isValid = zodValidation.isValid && schemaValidation.isValid`
   - UI muestra resultado unificado: "Validación Exitosa" o "Validación Fallida"

**Mapeo Crítico EntityType → TableName:**
```
EntityType (singular)    → PostgreSQL Table (plural)
'articulo'               → 'articulos'
'comprobante_cabecera'   → 'comprobantes_cabecera'
'comprobante_detalle'    → 'comprobantes_detalle'
'comprobante_pago'       → 'comprobantes_pagos'
```

**Nota Importante:** Siempre usar `entityTypeToTableName()` al comunicarse con el Gateway. Ver CONVENTIONS.md para detalles.

**State Management:**

- **Objective Sync State**: SQLite `config`, `connection_config`, `queries`, `sync_state`, `retry_queue`, `sync_logs` tables
- **Gateway State**: PostgreSQL tables via Prisma (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
- **Session State**: Fastify sessions stored in memory (Objective Sync dashboard)
- **Job State**: In-memory job tracker during Gateway batch ingestion

## Key Abstractions

**IDataSourceAdapter:**
- Purpose: Abstraction for different data sources (SQL Server, PostgreSQL, MySQL, Excel)
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/types.ts`
- Pattern: Strategy pattern with pluggable implementations
- Key methods: `connect()`, `executeQuery()`, `getTables()`, `getColumns()`, `testConnection()`

**SyncEngine:**
- Purpose: Central orchestrator for complete sync workflow
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/sync-engine.ts`
- Pattern: Façade pattern coordinating adapter, validator, batch processor, API client
- Key methods: `sync()`, `syncEntity()`, `testConnection()`

**Repository Pattern (Objective Sync):**
- Purpose: Centralized data access for SQLite tables
- Locations:
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/config-repo.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/connection-config-repo.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/queries-repo.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/sync-state-repo.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/retry-queue-repo.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/sync-logs-repo.ts`
- Pattern: Function-based repositories (not classes) using Drizzle ORM
- Exports: CRUD functions for each entity

**Prisma Models (Gateway):**
- Purpose: ORM for PostgreSQL models
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`
- Entities: Articulo, ComprobanteCabecera, ComprobanteDetalle, ComprobantePagos
- Pattern: Prisma Client-generated models with snake_case database mapping

**IngestionService:**
- Purpose: Batch ingestion logic for Gateway
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/services/ingestion.ts`
- Pattern: Static methods for each entity type (upsert with error collection)
- Key methods: `ingestArticulos()`, `ingestComprobantesCabecera()`, `ingestComprobantesDetalle()`, `ingestComprobantesPagos()`

## Entry Points

**Objective Sync:**
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/index.ts`
- Triggers: `npm run dev` (tsx watch) or `npm start` (node)
- Responsibilities:
  1. Load environment configuration
  2. Initialize SQLite database
  3. Ensure admin user exists
  4. Create Fastify app with plugins (cookies, sessions, view engine)
  5. Register all dashboard routes
  6. Initialize scheduler for automatic sync jobs
  7. Start server on configured PORT

**Gateway:**
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/server.ts`
- Triggers: `npm run dev` (tsx watch) or `npm start` (node)
- Responsibilities:
  1. Attempt PostgreSQL connection (non-blocking)
  2. Build Fastify app with CORS, JWT
  3. Register all API routes
  4. Start server on PORT (default 3335)

**Scheduler:**
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/scheduler-instance.ts`
- Triggers: Automatically on Objective Sync startup via `initScheduler()`
- Responsibilities:
  1. Read all scheduled queries from database
  2. For each enabled query, create periodic job with `syncInterval`
  3. Execute SyncEngine.sync() on interval
  4. Handle job lifecycle (start, stop, pause)

## Error Handling

**Strategy:** Layered with escalation and retry logic

**Patterns:**

1. **Adapter Layer Errors**
   - Connection failures logged with full error context
   - testConnection() returns TestResult with success/error message
   - Adapter throws error to caller, not silently caught

2. **Validation Errors**
   - QueryValidator catches Zod validation failures
   - Records field-by-field error details
   - Continues processing other records (non-blocking)
   - Logs validation errors to sync_logs

3. **Batch Processing Errors**
   - BatchProcessor captures errors per record in batch
   - Collects errors array without stopping batch
   - Applies confirmation policy (strict/lenient)
   - Failed batches go to retry_queue

4. **Retry Mechanism**
   - RetryQueueManager enqueues failed batches
   - Exponential backoff delays between attempts
   - Max retries configurable (default: 3)
   - After max retries, marked as permanently failed

5. **Global Error Handler (Objective Sync Dashboard)**
   - Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/index.ts` lines 121-149
   - Catches all unhandled errors in request handlers
   - Returns JSON for HTMX requests, HTML for browser requests
   - Production: generic error message, Development: full stack trace

6. **Global Error Handler (Gateway)**
   - Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/middleware/error-handler.ts`
   - Validates request bodies with Zod schemas
   - Returns standardized error response: `{ success: false, error: message, errors?: details }`

## Cross-Cutting Concerns

**Logging:**
- Framework: pino with pino-pretty in development
- Configuration: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/logger.ts`
- Level: Based on LOG_LEVEL env var
- Usage: `logger.info()`, `logger.warn()`, `logger.error()`, `logger.debug()`
- Transports: pino-pretty for colorized console output in dev

**Validation:**
- Framework: Zod schemas
- Entity schemas: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/types/`
- Batch schemas: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/shared/schemas/`
- Pattern: Schemas exported from types files, reused in QueryValidator and route handlers

**Authentication:**
- Objective Sync: Session-based with bcrypt password hashing
  - Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/services/auth-service.ts`
  - Middleware: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/middleware/auth.ts`
  - Session secret: SESSION_SECRET env var

- Gateway: JWT Bearer token
  - Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/middleware/auth.ts`
  - Secret: JWT_SECRET env var
  - Expires: JWT_EXPIRES_IN env var (default: 24h)

**Encryption:**
- Stored for sensitive data (connection credentials)
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/crypto.ts`
- Usage: Connection configs encrypted before storing in SQLite, decrypted before use

---

*Architecture analysis: 2026-01-26*
