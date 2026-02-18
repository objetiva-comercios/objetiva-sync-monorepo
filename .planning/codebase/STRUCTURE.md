# Codebase Structure

**Analysis Date:** 2026-02-06

## Directory Layout

```
objetiva-sync-monorepo/
├── shared/                                 # Shared schemas (PostgreSQL → Zod)
│   ├── schemas/
│   │   ├── index.ts                        # Re-exports all generated schemas
│   │   └── generated/                      # Auto-generated from PostgreSQL
│   │       ├── articulos.schema.ts         # Zod schema + EntityMetadata
│   │       ├── comprobantes_cabecera.schema.ts
│   │       ├── comprobantes_detalle.schema.ts
│   │       └── comprobantes_pagos.schema.ts
│   ├── types/
│   │   ├── index.ts
│   │   └── schema-metadata.ts              # EntityMetadata, ValidationRule types
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md                           # Documentation
│
├── objetiva-sync/                          # Main synchronizer application
│   ├── src/
│   │   ├── index.ts                        # Entry point: starts Fastify server
│   │   ├── adapters/                       # Data source adapters (Strategy pattern)
│   │   │   ├── types.ts                    # IDataSourceAdapter interface
│   │   │   ├── base-adapter.ts             # AbstractAdapter base class
│   │   │   ├── database-adapter.ts         # Shared database utilities
│   │   │   ├── sqlserver/                  # SQL Server implementation
│   │   │   │   ├── sqlserver-adapter.ts    # SQLServerAdapter class
│   │   │   │   └── index.ts                # Exports
│   │   │   └── index.ts                    # Factory: createAdapter()
│   │   │
│   │   ├── api-client/                     # HTTP client for Gateway API
│   │   │   ├── index.ts                    # APIClient: main client class
│   │   │   ├── auth.ts                     # AuthManager: JWT login/token
│   │   │   ├── articulos-client.ts         # ArticulosClient: POST /api/articulos/batch
│   │   │   ├── comprobantes-cabecera-client.ts
│   │   │   ├── comprobantes-detalle-client.ts
│   │   │   ├── comprobantes-pagos-client.ts
│   │   │   └── ...
│   │   │
│   │   ├── config/                         # Configuration management
│   │   │   ├── env.ts                      # loadEnv(), requireEnv()
│   │   │   ├── constants.ts                # SYNC_CONFIG, LOG_CONFIG
│   │   │   └── index.ts                    # Re-exports
│   │   │
│   │   ├── dashboard/                      # Web UI (HTMX + EJS views)
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts                 # Session auth middleware
│   │   │   ├── routes/
│   │   │   │   ├── index.ts                # registerRoutes() - main route setup
│   │   │   │   ├── auth.ts                 # GET/POST login, logout
│   │   │   │   ├── dashboard.ts            # GET /dashboard - main page
│   │   │   │   ├── config.ts               # POST /config - save config
│   │   │   │   ├── scheduler.ts            # GET /scheduler, POST /scheduler/update
│   │   │   │   ├── sync.ts                 # POST /sync - trigger manual sync
│   │   │   │   ├── logs.ts                 # GET /logs - view sync logs
│   │   │   │   ├── api/                    # AJAX API endpoints
│   │   │   │   │   ├── dashboard.ts        # GET /api/dashboard/stats
│   │   │   │   │   ├── config.ts           # GET/POST /api/config/*
│   │   │   │   │   ├── connections.ts      # GET/POST /api/connections/*
│   │   │   │   │   ├── sync.ts             # POST /api/sync/start
│   │   │   │   │   ├── scheduler.ts        # GET/POST /api/scheduler/*
│   │   │   │   │   ├── logs.ts             # GET /api/logs/*
│   │   │   │   │   ├── retry-queue.ts      # GET /api/retry-queue/*
│   │   │   │   │   ├── queries.ts          # GET/POST /api/queries/*
│   │   │   │   │   └── schema-info.ts      # GET /api/schema-info/*
│   │   │   │   └── ...
│   │   │   ├── views/                      # EJS templates
│   │   │   │   ├── layouts/
│   │   │   │   │   └── main.ejs            # Master layout
│   │   │   │   ├── dashboard.ejs           # Main dashboard page
│   │   │   │   ├── config.ejs              # Configuration page
│   │   │   │   ├── ...
│   │   │   └── static/                     # CSS, JS, images
│   │   │
│   │   ├── store/                          # SQLite database (Drizzle ORM)
│   │   │   ├── index.ts                    # initDatabase(), getDb()
│   │   │   ├── schema.ts                   # Drizzle schema: config, connection_config, queries, etc.
│   │   │   └── repositories/               # Data access layer
│   │   │       ├── index.ts                # Central exports
│   │   │       ├── config-repo.ts          # Config table CRUD
│   │   │       ├── connection-config-repo.ts # Connection config CRUD
│   │   │       ├── queries-repo.ts         # Queries CRUD + getScheduledQueries()
│   │   │       ├── sync-state-repo.ts      # Sync state CRUD
│   │   │       ├── retry-queue-repo.ts     # Retry queue CRUD
│   │   │       ├── sync-logs-repo.ts       # Sync logs CRUD + deleteOldLogs()
│   │   │       └── notification-config-repo.ts
│   │   │
│   │   ├── sync/                           # Synchronization engine
│   │   │   ├── index.ts                    # Exports
│   │   │   ├── sync-engine.ts              # SyncEngine: main orchestrator
│   │   │   ├── batch-processor.ts          # processBatches(): chunk + retry logic
│   │   │   ├── scheduler.ts                # Scheduler: manages periodic jobs
│   │   │   ├── scheduler-instance.ts       # Singleton scheduler instance
│   │   │   ├── sync-queue.ts               # SyncQueue: in-memory job queue
│   │   │   ├── sync-queue-instance.ts      # Singleton queue instance
│   │   │   ├── sync-state-manager.ts       # SyncStateManager: tracks sync state
│   │   │   ├── retry-queue-manager.ts      # RetryQueueManager: handles retries
│   │   │   ├── query-validator.ts          # validateQueryResult(): Zod validation
│   │   │   └── ...
│   │   │
│   │   ├── services/
│   │   │   └── auth-service.ts             # ensureAdminExists(), password hashing
│   │   │
│   │   ├── types/                          # TypeScript type definitions
│   │   │   ├── index.ts                    # Common types: EntityType, SyncType, LogStatus, etc.
│   │   │   ├── common.ts                   # Shared types
│   │   │   ├── articulos.ts                # IArticuloPayload and schemas
│   │   │   ├── comprobantes-cabecera.ts    # ComprobanteCabeceraPayload and schemas
│   │   │   ├── comprobantes-detalle.ts     # ComprobanteDetallePayload and schemas
│   │   │   ├── comprobantes-pagos.ts       # ComprobantePagosPayload and schemas
│   │   │   └── fastify.d.ts                # Fastify type augmentations
│   │   │
│   │   ├── utils/                          # Shared utilities
│   │   │   ├── logger.ts                   # Pino logger configuration
│   │   │   ├── crypto.ts                   # encrypt(), decrypt()
│   │   │   ├── helpers.ts                  # chunk(), retry helpers
│   │   │   ├── batch-storage.ts            # saveBatch() - JSON file storage
│   │   │   └── index.ts                    # Exports
│   │   │
│   │   ├── __tests__/                      # Integration tests
│   │   │   ├── sync-engine-metadata.test.ts
│   │   │   ├── api-client-metadata.test.ts
│   │   │   ├── integration-query-based-sync.test.ts
│   │   │   └── repositories-query-based.test.ts
│   │   │
│   │   └── .residual-md-tests(borrar)/    # Deprecated test files (to delete)
│   │
│   ├── database/                           # SQLite database files
│   │   └── migrations/                     # Drizzle migrations
│   │
│   ├── tests/                              # Test files
│   │
│   ├── docs/                               # Documentation
│   │
│   ├── scripts/                            # Utility scripts
│   │   ├── install-service.js              # Windows service installer
│   │   └── uninstall-service.js            # Windows service uninstaller
│   │
│   ├── dist/                               # Compiled output
│   │
│   ├── drizzle.config.ts                   # Drizzle ORM configuration
│   ├── tsconfig.json                       # TypeScript configuration
│   ├── vitest.config.ts                    # Test runner configuration
│   ├── eslint.config.js                    # Linting rules
│   ├── .prettierrc                         # Code formatting
│   └── package.json                        # Dependencies: fastify, drizzle, zod, etc.
│
└── objetiva-sync-gateway/                  # API Gateway for receiving batches
    ├── src/
    │   ├── server.ts                       # Entry point: starts Fastify server
    │   ├── app.ts                          # buildApp(): creates Fastify instance
    │   │
    │   ├── lib/                            # Shared utilities
    │   │   ├── logger.ts                   # Pino logger configuration
    │   │   ├── prisma.ts                   # Prisma client singleton
    │   │   ├── metrics.ts                  # Performance metrics tracking
    │   │   └── job-tracker.ts              # Aggregates batch metadata into jobs
    │   │
    │   ├── middleware/
    │   │   ├── auth.ts                     # authenticate(): JWT verification
    │   │   └── error-handler.ts            # registerErrorHandler(): global error handling
    │   │
    │   ├── routes/                         # API endpoints
    │   │   ├── status.ts                   # GET /status, /health - monitoring
    │   │   ├── setup.ts                    # GET /setup, POST /setup - DB initialization
    │   │   ├── auth.ts                     # POST /auth/login - user authentication
    │   │   ├── articulos.ts                # POST /api/articulos/batch
    │   │   ├── comprobantes.ts             # POST /api/comprobantes/**/batch endpoints
    │   │   └── ...
    │   │
    │   ├── services/
    │   │   └── ingestion.ts                # IngestionService: batch upsert logic
    │   │       ├── ingestArticulos()
    │   │       ├── ingestComprobantesCabecera()
    │   │       ├── ingestComprobantesDetalle()
    │   │       └── ingestComprobantesPagos()
    │   │
    │   └── types/
    │       └── index.ts                    # Type definitions
    │
    ├── prisma/
    │   ├── schema.prisma                   # PostgreSQL schema (Articulo, Comprobante*, models)
    │   └── migrations/                     # Prisma migrations
    │
    ├── codegen/                            # Schema generation from PostgreSQL
    │   ├── index.ts                        # Main entry point
    │   ├── types.ts                        # ColumnMetadata, TableSchema types
    │   ├── schema-introspector.ts          # PostgreSQL introspection
    │   ├── zod-generator.ts                # Zod schema generation
    │   ├── prisma-generator.ts             # Prisma schema generation
    │   └── diff-display.ts                 # Schema diff visualization
    │
    ├── dist/                               # Compiled output
    │
    ├── tsconfig.json                       # TypeScript configuration
    ├── .env                                # Environment variables (PostgreSQL, JWT, etc.)
    ├── .env.example                        # Example env vars
    └── package.json                        # Dependencies: fastify, prisma, zod, etc.
```

## Directory Purposes

**shared/:**
- Purpose: Single source of truth for Zod schemas shared between gateway and sync
- Contains: Auto-generated Zod schemas from PostgreSQL introspection, EntityMetadata types
- Key pattern: `npm run regenerate-schemas` in gateway regenerates all files
- Usage: Both projects import from `../shared/schemas/index.js`

**shared/schemas/generated/:**
- Purpose: Auto-generated Zod schemas with EntityMetadata
- Generated: Yes (by `npm run regenerate-schemas` in gateway)
- Contains: `{entity}.schema.ts` files with Zod schemas and metadata
- DO NOT EDIT: Manual changes are overwritten on regeneration

**objetiva-sync-gateway/src/codegen/:**
- Purpose: PostgreSQL → Zod/Prisma code generation system
- Contains: Introspector, generators, diff display
- Key files:
  - `schema-introspector.ts`: Reads PostgreSQL information_schema
  - `zod-generator.ts`: Generates Zod schemas with EntityMetadata
  - `prisma-generator.ts`: Generates Prisma schema with @id/@map

**objetiva-sync/src/adapters/:**
- Purpose: Pluggable data source connectors implementing Strategy pattern
- Contains: Interfaces, base classes, SQL Server implementation, adapter factory
- Key files: `types.ts` (IDataSourceAdapter interface), `sqlserver/sqlserver-adapter.ts` (implementation)

**objetiva-sync/src/api-client/:**
- Purpose: HTTP client for communicating with Gateway API
- Contains: Main client class, auth manager, endpoint-specific clients
- Key pattern: One client class per entity type (articulos, comprobantes-cabecera, etc.)

**objetiva-sync/src/config/:**
- Purpose: Centralized configuration management
- Contains: Environment loading, validation, constants
- Key responsibility: Load .env first before any module initialization

**objetiva-sync/src/dashboard/:**
- Purpose: Web interface for manual control and monitoring
- Contains: HTML views (EJS), HTMX-powered API routes, middleware
- Architecture: Routes handle both HTML (for page requests) and JSON (for AJAX)

**objetiva-sync/src/store/:**
- Purpose: SQLite database persistence layer
- Contains: Drizzle ORM schema definitions, repository functions for each table
- Pattern: Function-based repositories (not classes), all operations are async

**objetiva-sync/src/sync/:**
- Purpose: Core synchronization orchestration
- Contains: SyncEngine, batch processor, scheduler, validation, retry logic, state management
- Key components:
  - `sync-engine.ts`: Façade coordinating adapter → validator → batch processor → API client
  - `batch-processor.ts`: Chunks data, handles retries with exponential backoff
  - `scheduler.ts`: Manages periodic jobs, one job per scheduled query
  - `query-validator.ts`: Zod schema validation for query results

**objetiva-sync/src/types/:**
- Purpose: TypeScript type definitions and Zod schemas for entities
- Contains: Schemas for articulos, comprobantes (cabecera/detalle/pagos)
- Pattern: Each entity has payload interface, Zod schema, and batch schema

**objetiva-sync/src/utils/:**
- Purpose: Shared utility functions
- Contains: Logging (pino), encryption (crypto), helpers (chunk, retry), batch storage
- Key: logger should be imported everywhere for consistent logging

**objetiva-sync-gateway/src/services/:**
- Purpose: Business logic for data ingestion
- Contains: IngestionService with per-entity methods
- Pattern: Static methods, one method per entity type, upsert with error collection

**objetiva-sync-gateway/src/routes/:**
- Purpose: HTTP API endpoints
- Contains: Batch ingestion routes, setup routes, auth routes
- Pattern: Each route uses Zod schema for request validation, calls IngestionService

**monorepo-root/shared/:**
- Purpose: Shared code between both applications (located at monorepo root)
- Contains: Auto-generated Zod schemas from PostgreSQL introspection
- Usage: Gateway validates incoming batches, Sync validates query results
- Regeneration: `cd objetiva-sync-gateway && npm run regenerate-schemas`

## Key File Locations

**Entry Points:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/index.ts`: Objective Sync main server
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/server.ts`: Gateway main server

**Configuration:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/config/env.ts`: Environment loading
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/config/constants.ts`: System constants
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`: Gateway schema

**Core Logic:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/sync-engine.ts`: Main orchestrator
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/index.ts`: Adapter factory
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/sync/batch-processor.ts`: Batch handling
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/services/ingestion.ts`: Data persistence

**Testing:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/vitest.config.ts`: Test runner config
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/__tests__/`: Test files
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/tests/`: Additional tests

**Database:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/schema.ts`: SQLite schema (Drizzle)
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/`: Data access layer
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`: PostgreSQL schema

**Types & Schemas:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/shared/schemas/generated/`: Auto-generated Zod schemas (source of truth)
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/shared/types/`: EntityMetadata types
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/types/`: Legacy entity payload types
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`: PostgreSQL schema (auto-generated)

## Naming Conventions

**Files:**
- `*.ts`: TypeScript source files
- `*-repo.ts`: Repository (data access) files
- `*-client.ts`: Client/service classes
- `*.test.ts`: Vitest test files
- `*.config.ts` or `*.config.js`: Configuration files
- `.d.ts`: Type declaration files

**Directories:**
- `src/`: Source code (TypeScript)
- `dist/`: Compiled output (JavaScript)
- `tests/` or `__tests__/`: Test files
- `migrations/`: Database migrations
- `views/` or `templates/`: UI templates (EJS)
- `static/`: Static assets (CSS, JS, images)
- `lib/`: Shared utility libraries
- `utils/`: Helper functions
- `services/`: Business logic
- `middleware/`: Express/Fastify middleware
- `routes/`: Route handlers
- `repositories/`: Data access objects

**Functions:**
- `camelCase` for functions: `processSync()`, `validateQuery()`, `createAdapter()`
- `createX()`: Factory functions
- `getX()`: Getter functions
- `setX()`: Setter functions
- `isX()` or `hasX()`: Boolean predicates

**Variables:**
- `camelCase` for variables: `syncEngine`, `apiClient`, `batchSize`
- `UPPER_SNAKE_CASE` for constants: `BATCH_SIZE`, `MAX_RETRIES`, `SYNC_CONFIG`

**Types & Interfaces:**
- `PascalCase` for types: `SyncEngine`, `APIClient`, `IDataSourceAdapter`
- `IXxx` prefix for interfaces: `IDataSourceAdapter`, `IQueryResult`

## Where to Add New Code

**New Feature (e.g., Add Remitos entity):**
- Database first approach:
  1. Create table in PostgreSQL with appropriate columns and constraints
  2. Add COMMENT ON COLUMN for business validations
  3. Run `cd objetiva-sync-gateway && npm run regenerate-schemas`
  4. Zod schema auto-generated in `shared/schemas/generated/remitos.schema.ts`
  5. Prisma schema auto-updated in `prisma/schema.prisma`
- Code changes needed:
  - API client: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/api-client/remitos-client.ts` (new file)
  - Gateway route: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/routes/remitos.ts` (new file)
  - Gateway ingestion: Add method to `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/services/ingestion.ts`
- Tests:
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/__tests__/remitos.test.ts`
  - Gateway tests in appropriate test directory
- NOTE: Do NOT manually create schema files - they are auto-generated from PostgreSQL

**New Adapter (e.g., MySQL support):**
- Implementation: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/mysql/mysql-adapter.ts` (new directory)
- Base class: Extend `AbstractAdapter` from `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/base-adapter.ts`
- Registration: Update factory in `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/index.ts`

**New Utility Function:**
- Shared helpers: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/helpers.ts`
- Crypto operations: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/crypto.ts`
- Export from: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/index.ts`

**New Repository (e.g., Audit Log tracking):**
- Schema table: Add to `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/schema.ts`
- Repository file: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/audit-log-repo.ts`
- Export: Add to `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/repositories/index.ts`

**New Dashboard Route:**
- Route handler: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/[feature].ts`
- EJS view: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/views/[feature].ejs`
- API endpoint: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/api/[feature].ts`
- Register in: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/dashboard/routes/index.ts`

## Special Directories

**objetiva-sync/database/:**
- Purpose: Persistent SQLite storage (local file)
- Generated: Yes (created by Drizzle on first run)
- Committed: No (git ignored, `.gitignore` excludes `*.db`)
- Contains: `objetiva-sync.db` with all config, state, and logs

**objetiva-sync/logs/:**
- Purpose: Per-sync batch JSON files (for debugging)
- Generated: Yes (created when `saveBatches: true` in BatchProcessor options)
- Committed: No (git ignored)
- Contains: JSON dumps of each batch for audit trail

**objetiva-sync/dist/:**
- Purpose: Compiled JavaScript output (production build)
- Generated: Yes (by `npm run build`)
- Committed: No (git ignored)
- Contains: `.js` and `.d.ts` files compiled from TypeScript

**objetiva-sync-gateway/dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: No (git ignored)

**objetiva-sync-gateway/prisma/migrations/:**
- Purpose: Prisma migration history
- Generated: Yes (by `prisma migrate dev`)
- Committed: Yes (in git)
- Contains: Migration files tracking schema changes

---

*Structure analysis: 2026-01-26*
