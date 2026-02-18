# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**Remote Data API (Configurable):**
- Purpose: Receives synced data from objektiva-sync
- Authentication: JWT token-based (credentials configured via dashboard)
- Environment variables:
  - `REMOTE_API_URL` - Base URL of the remote API
  - Remote API username/password (set via dashboard at runtime)
- SDK/Client: Built-in HTTP client using `undici` fetch API
- Files: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/api-client/` contains:
  - `auth.ts` - AuthManager handles JWT authentication, token refresh, and caching
  - `articulos-client.ts` - Sends product/article batches
  - `comprobantes-cabecera-client.ts` - Sends invoice headers
  - `comprobantes-detalle-client.ts` - Sends invoice detail lines
  - `comprobantes-pagos-client.ts` - Sends payment information

**Gateway API Endpoints (Inbound):**
- Located at: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/routes/`
- Port: 3335 (default, configurable via PORT env var)
- Endpoints available:
  - `POST /api/articulos/batch` - Receive article/product batch
  - `POST /api/comprobantes/cabecera/batch` - Receive invoice header batch
  - `POST /api/comprobantes/detalle/batch` - Receive invoice line detail batch
  - `POST /api/comprobantes/pagos/batch` - Receive payment batch
- Authentication: Bearer token required (JWT from auth endpoint)
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/middleware/auth.ts`

## Data Storage

**Databases:**

**SQLite (objetiva-sync - Local Storage):**
- Purpose: Local configuration and sync state tracking
- Connection: `./database/objetiva-sync.db` (relative path from project root)
- Client: better-sqlite3 (native synchronous driver)
- ORM: Drizzle ORM
- Tables managed: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/store/schema.ts`
  - `config` - General configuration (encrypted values supported)
  - `connection_config` - ERP source connection settings
  - `queries` - SQL queries configured for each entity
  - `sync_state` - Current sync state and progress
  - `retry_queue` - Failed sync batches awaiting retry
  - `sync_logs` - Historical sync operation logs
  - `notification_config` - Webhook and notification settings

**PostgreSQL (objetiva-sync-gateway - Remote Data):**
- Purpose: Central repository for synced ERP data
- Connection: Environment variable `DATABASE_URL`
- Format: `postgresql://user:password@host:port/database`
- Client: Prisma ORM
- Schema location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/prisma/schema.prisma`
- Tables:
  - `articulos` - Products/articles with full metadata
  - `comprobantes_cabecera` - Invoice headers (accounting/fiscal)
  - `comprobantes_detalle` - Invoice line items with IVA calculations
  - `comprobantes_pagos` - Payment methods and transactions

**ERP Source Databases (Configurable):**
- Supported types (selectable per connection):
  - SQL Server (via `mssql` package with `msnodesqlv8` driver)
  - PostgreSQL
  - MySQL
  - Excel files
- Adapter pattern: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/adapters/`
  - `sqlserver/` - SQL Server implementation
  - `postgres/` - PostgreSQL implementation
  - `mysql/` - MySQL implementation
  - `excel/` - Excel file implementation
- Configuration stored in local SQLite `connection_config` table (encrypted)

**File Storage:**
- Local filesystem only
- Logs: `./logs/sync.log` (configurable via LOG_FILE env var)
- Database: `./database/` directory
- No cloud storage integration detected

**Caching:**
- None - No Redis or external caching service
- In-memory token caching: AuthManager caches JWT tokens with refresh logic (5-minute safety margin)

## Authentication & Identity

**Auth Provider:**
- Custom implementation (no OAuth/third-party providers)

**objektiva-sync (Local):**
- Implementation: Session-based with bcrypt password hashing
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/services/auth-service.ts`
- Admin credential initialization: Auto-generated on first run if not configured
- Initial password: Configurable via `ADMIN_PASSWORD` env var (default: `cambiar123`)
- Session management: Fastify sessions with cookie storage
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/index.ts` (lines 69-79)

**objektiva-sync-gateway (Remote API):**
- Implementation: JWT token-based
- Location: `C:/Users/sistemas/.proyectos/objektiva-sync-monorepo/objektiva-sync-gateway/src/middleware/auth.ts`
- Environment variables:
  - `JWT_SECRET` - Secret for token signing/verification
  - `JWT_EXPIRES_IN` - Token expiration time (default: 86400 seconds = 24 hours)
  - `SYNC_USERNAME` - Fixed synchronizer username
  - `SYNC_PASSWORD_HASH` - Pre-hashed password for synchronizer
- Password hashing: bcryptjs (2.4.3)
- Auth endpoint: `POST /auth/login`

**Remote API Authentication:**
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/api-client/auth.ts`
- Method: Username/password → JWT token
- Token caching: Automatic refresh with 5-minute margin before expiration
- Fallback: Tokens are cached and reused until expiration

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, DataDog, or third-party error service integration

**Logs:**
- Framework: Pino (high-performance JSON logging)
- Configuration files:
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync/src/utils/logger.ts`
  - `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/src/lib/logger.ts`
- Development: Pretty-printed output to console (colorized)
- Production: JSON logs to file and console
- Log file: `./logs/sync.log` (configurable)
- Log level: Controlled by `LOG_LEVEL` env var (default: `info`)
- Automatic cleanup: Old logs deleted based on retention policy
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/store/repositories/sync-logs-repo.ts`

**Sync Logging:**
- Historical log storage in SQLite `sync_logs` table
- Tracks: Start time, end time, records processed, errors, status
- API endpoint: `GET /api/logs` (dashboard access)

**Status & Health:**
- Endpoint: `GET /health` (gateway)
- Endpoint: `GET /status` (dashboard monitoring)
- Gateway tracks: Database connection status, last health check time, startup time
- Location: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync-gateway/src/server.ts` (systemState object)

## CI/CD & Deployment

**Hosting:**
- Local/On-premises deployment (no cloud provider detected)
- Windows service support: Scripts available for Windows service installation
  - `npm run service:install` - Install as Windows service
  - `npm run service:uninstall` - Uninstall service
  - Location: `C:/Users/sistemas/.proyectos/objektiva-sync-monorepo/objetiva-sync/scripts/`

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or Jenkins integration

**Deployment:**
- Manual: Build and start via npm scripts
- Production command: `npm run build && npm run start`
- Environment configuration: `.env` file in deployment directory

## Environment Configuration

**Required env vars (objektiva-sync):**
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production/test)
- `APP_NAME` - Application display name (default: "Objetiva Sync")
- `ENCRYPTION_KEY` - Encryption for sensitive config (auto-generated if missing)
- `SESSION_SECRET` - Session signing key (auto-generated if missing)
- `ADMIN_PASSWORD` - Initial admin password (default: "cambiar123")
- `LOG_LEVEL` - Logging level (default: "info")
- `LOG_FILE` - Log file path (default: "./logs/sync.log")
- `DATABASE_PATH` - SQLite database location (default: "./database/objetiva-sync.db")
- `REMOTE_API_URL` - Remote API base URL (configured via dashboard)
- `REMOTE_API_USERNAME` - Remote API credentials (configured via dashboard)
- `REMOTE_API_PASSWORD` - Remote API credentials (configured via dashboard)
- `SYNC_INTERVAL_MINUTES` - Sync polling interval (configured via dashboard)
- `BATCH_SIZE` - Records per batch (configured via dashboard)

**Required env vars (objektiva-sync-gateway):**
- `PORT` - Server port (default: 3335)
- `NODE_ENV` - Environment (development/production)
- `DATABASE_URL` - PostgreSQL connection string (required for data persistence)
- `JWT_SECRET` - Secret for JWT signing
- `JWT_EXPIRES_IN` - Token expiration in seconds (default: 86400)
- `SYNC_USERNAME` - Synchronizer login username (default: "admin")
- `SYNC_PASSWORD_HASH` - Pre-hashed password for synchronizer
- `LOG_LEVEL` - Logging level (default: "info")

**Secrets location:**
- `.env` files (both packages)
- `.env.example` - Template with public values
- Secrets never committed (`.env` should be in .gitignore)
- Sensitive config encrypted in SQLite when possible
- Environment variables loaded via `dotenv` package (objektiva-sync)

## Webhooks & Callbacks

**Incoming:**
- Webhook configuration framework detected but not fully implemented
- Table: `notification_config` in SQLite schema
- Location: `C:/Users/sistemas/.proyectos/objektiva-sync-monorepo/objektiva-sync/src/store/repositories/notification-config-repo.ts`
- Purpose: Configure webhook destinations for sync events
- Status: Infrastructure in place, trigger logic pending

**Outgoing:**
- None detected - No callbacks to external systems in current implementation
- Potential for future webhook notifications to client systems

## ERP Adapter System

**Supported ERP Sources:**
- SQL Server (via `mssql` + `msnodesqlv8`)
- PostgreSQL
- MySQL
- Excel files

**Adapter Location:**
- `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/adapters/`

**Base Adapter Pattern:**
- File: `C:/Users/sistemas/.proyectos/objetiva-sync-monorepo/objektiva-sync/src/adapters/base-adapter.ts`
- All adapters inherit from `BaseAdapter`
- Interface: `C:/Users/sistemas/.proyectos/objektiva-sync-monorepo/objektiva-sync/src/adapters/types.ts`

**Query Execution:**
- Custom SQL queries stored in SQLite `queries` table
- Per-entity configuration (Articulos, Comprobantes, Pagos)
- Query timeout: 30 seconds (configurable up to 5 minutes)
- Result transformation: Mapped to canonical payload schemas via Zod validation

---

*Integration audit: 2026-01-26*
