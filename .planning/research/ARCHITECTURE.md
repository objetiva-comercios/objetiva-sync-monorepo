# Architecture Research: v1.1-rc2 Multi-Source & Hardening

**Domain:** Multi-source sync system enhancement
**Researched:** 2026-02-11
**Confidence:** HIGH (based on comprehensive codebase analysis)

---

## Executive Summary

The v1.1-rc2 features integrate cleanly with the existing objetiva-sync architecture. The adapter pattern already supports multiple data sources; PostgreSQL adapter slots in alongside SQLServerAdapter. Multi-source upsert requires gateway ingestion changes (origin tracking), not sync-side changes. Dashboard modernization can proceed incrementally with shadcn/ui integration into the existing gateway React dashboard. Auth simplification and observability are additive layers that don't modify existing flows.

**Key finding:** The existing architecture was designed for extensibility. All v1.1-rc2 features map to existing extension points.

---

## Current Architecture Overview

```
+------------------+     HTTP/JWT      +--------------------+
|   objetiva-sync  | ----------------> | objetiva-sync-     |
|   (Sync Module)  |                   | gateway            |
+------------------+                   +--------------------+
        |                                      |
        |                                      |
  +-----v------+                        +------v------+
  | SQL Server |                        | PostgreSQL  |
  | (ERP)      |                        | (Dest)      |
  +------------+                        +-------------+
        ^
        |
  BaseAdapter <---- SQLServerAdapter (current)
              <---- PostgreSQLAdapter (v1.1-rc2 NEW)
```

**Key Existing Patterns:**
| Pattern | Location | Purpose |
|---------|----------|---------|
| **Adapter Pattern** | `adapters/` | Pluggable data source connectors |
| **Query-Based Sync** | `sync/sync-engine.ts` | SQL queries drive extraction |
| **Batch Processing** | `sync/batch-processor.ts` | Chunked sends with retry |
| **Schema Validation** | `sync/schema-validator.ts` | Zod schemas from PostgreSQL |
| **Entity Routing** | `api-client/*.ts` | Per-entity HTTP clients |
| **Job Tracking** | `lib/job-tracker.ts` | Multi-batch sync aggregation |

---

## Integration Analysis by Feature

### 1. PostgreSQL Adapter

**Integration Points:**

| Component | File | Integration Type |
|-----------|------|------------------|
| AbstractAdapter | `adapters/base-adapter.ts` | INHERIT (no changes) |
| IDataSourceAdapter | `adapters/types.ts` | IMPLEMENTS (no changes) |
| ADAPTER_REGISTRY | `adapters/index.ts` | ADD entry |
| createAdapter() | `adapters/index.ts` | USES (no changes) |
| Connection config UI | `views/config/connection.ejs` | EXTEND template |
| SyncEngine | `sync/sync-engine.ts` | USES (no changes) |

**New Components:**
```
objetiva-sync/src/adapters/postgres/
  postgres-adapter.ts    # PostgreSQLAdapter extends AbstractAdapter
  index.ts               # Re-exports
```

**Data Flow (unchanged pattern):**
```
Connection Config (SQLite)
    |
    v
PostgreSQLAdapter.connect()
    |
    v
Query SQL --> PostgreSQLAdapter.executeQuery()
    |
    v
IQueryResult (same interface as SQLServer)
    |
    v
[Same downstream: QueryValidator -> BatchProcessor -> APIClient -> Gateway]
```

**Interface compliance (AbstractAdapter methods to implement):**
```typescript
// All methods defined in AbstractAdapter, must implement:
protected abstract doConnect(config: IConnectionConfig): Promise<void>;
protected abstract doDisconnect(): Promise<void>;
protected abstract doTestConnection(config: IConnectionConfig): Promise<TestResult>;
protected abstract doExecuteQuery(sql: string, params?: IQueryParams): Promise<IQueryResult>;
protected abstract doGetTables(): Promise<string[]>;
protected abstract doGetColumns(tableName: string): Promise<IColumnInfo[]>;
protected abstract doGetSampleData(tableName: string, limit: number): Promise<IQueryResult>;
```

**Config schema (new Zod schema):**
```typescript
const postgresConfigSchema = z.object({
  host: z.string().min(1, 'Host es requerido'),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, 'Base de datos es requerida'),
  user: z.string().min(1, 'Usuario es requerido'),
  password: z.string().min(1, 'Password es requerido'),
  ssl: z.boolean().default(false),
  schema: z.string().default('public'),
  options: z.object({
    connectionTimeout: z.number().int().min(1000).default(30000),
    statementTimeout: z.number().int().min(1000).default(120000),
  }).optional(),
});
```

**Driver recommendation:** `pg` (node-postgres) - industry standard, well-maintained, no native compilation required.

---

### 2. Free-Form Multi-Source Upsert

**Integration Points:**

| Component | File | Integration Type |
|-----------|------|------------------|
| Prisma schema | `prisma/schema.prisma` | ADD columns |
| IngestionService | `services/ingestion.ts` | MODIFY methods |
| API routes | `routes/articulos.ts`, etc. | MODIFY header extraction |
| Zod schemas | `shared/schemas/` | ADD optional fields |
| Metrics | `lib/metrics.ts` | EXTEND event type |
| Dashboard activity | `dashboard/src/components/ActivityFeed.tsx` | DISPLAY origin |

**Current Ingestion State:**
- Upsert uses composite keys (e.g., `erp_codigo_erp_nombre`)
- No origin tracking - all data assumed from single ERP
- `last write wins` already in effect (UPDATE overwrites all fields)
- `erp_fecha_sync` timestamp tracks when synced

**New Prisma Columns (per entity):**
```prisma
model Articulo {
  // ... existing fields ...

  // v1.1-rc2: Multi-source tracking
  origin_source    String?   // e.g., "sql-server-erp-01", "postgres-warehouse"
  origin_sync_id   String?   // Links to specific sync job
  origin_synced_at DateTime? // When this origin last wrote
}
```

**Data Flow Change:**
```
BEFORE:
  Sync -> POST /api/articulos/batch
       -> IngestionService.ingestArticulos(articulos, metadata)
       -> INSERT/UPDATE

AFTER:
  Sync -> POST /api/articulos/batch
          Headers: { X-Origin-Source: "sql-server-erp-01" }
       -> Route extracts origin from headers
       -> IngestionService.ingestArticulos(articulos, { ...metadata, origin: "sql-server-erp-01" })
       -> INSERT/UPDATE with origin_source, origin_sync_id, origin_synced_at
```

**Conflict Resolution:** Unchanged - last write wins. The `origin_synced_at` field provides audit trail.

**Backward Compatibility:**
- New columns are nullable
- Existing data gets `origin_source: NULL` (legacy/unknown)
- X-Origin-Source header is optional (defaults to NULL)

---

### 3. Dashboard Modernization (shadcn/ui)

**Integration Points:**

| Component | File | Integration Type |
|-----------|------|------------------|
| Gateway React dashboard | `dashboard/src/` | ENHANCE |
| Tailwind config | `dashboard/tailwind.config.js` | EXTEND |
| Package.json | `dashboard/package.json` | ADD deps |
| Vite config | `dashboard/vite.config.ts` | NO CHANGE |
| Sync HTMX dashboard | `objetiva-sync/src/dashboard/` | NO CHANGE (preserve) |

**Current Dashboard State:**

| Dashboard | Technology | Status | Location |
|-----------|------------|--------|----------|
| Sync Dashboard | HTMX + EJS | Working, 19 templates | `objetiva-sync/src/dashboard/views/` |
| Gateway Dashboard | React + Tailwind + Vite | Working, 10 components | `objetiva-sync-gateway/dashboard/` |

**Discovery:** Gateway already has React infrastructure:
- React 18 with Vite
- Tailwind CSS configured
- Custom hooks (`useGatewayData`)
- Lucide icons
- Custom `card.tsx` component exists

**Recommended Approach: Staged Migration**

**Phase 1 - Add shadcn to gateway React dashboard:**
```bash
cd objetiva-sync-gateway/dashboard
npx shadcn@latest init
npx shadcn@latest add button card table badge dialog input select alert toast
```

**New component structure:**
```
dashboard/src/
  components/
    ui/                    # shadcn components (auto-generated)
      button.tsx
      card.tsx             # Replace custom card
      table.tsx
      badge.tsx
      dialog.tsx
      input.tsx
      select.tsx
      alert.tsx
      toast.tsx
    Dashboard.tsx          # Uses shadcn components
    ActivityFeed.tsx       # Shows origin_source
    BatchList.tsx          # Enhanced with origin
    MetricCard.tsx         # Uses shadcn card
```

**Phase 2 (future) - Unified dashboard:**
- Expose sync status API endpoints with JWT auth
- Gateway dashboard fetches both gateway and sync data
- Single dashboard for complete observability

---

### 4. Auth Simplification

**Integration Points:**

| Component | File | Integration Type |
|-----------|------|------------------|
| Login route | `routes/auth.ts` | MODIFY |
| Setup route | `routes/setup.ts` | MODIFY |
| Auth middleware | `middleware/auth.ts` | ENHANCE error messages |
| Sync AuthManager | `api-client/auth.ts` | ADD refresh support |
| Sync gateway-client | `services/gateway-client.ts` | ADD refresh support |
| .env.example | `.env.example` | UPDATE documentation |

**Current Auth Flow:**
```
1. Admin generates bcrypt hash manually (outside system)
2. Admin sets SYNC_PASSWORD_HASH in gateway .env
3. Gateway restart required
4. Sync calls POST /auth/login with username/password
5. Gateway returns JWT token (24h expiry)
6. Sync uses Bearer token for all requests
7. On expiry, sync must re-login
```

**Pain Points:**
- Manual bcrypt hash generation is confusing
- No token refresh (full re-login required)
- No auth diagnostics
- Setup requires restart

**Simplified Flow (v1.1-rc2):**
```
1. Admin sets SYNC_ADMIN_PASSWORD (plaintext) in gateway .env
2. Gateway hashes on startup (auto-detected from .env)
3. Optional: /setup endpoint for password change without restart
4. Sync calls POST /auth/login, gets access + refresh tokens
5. On access token expiry, sync calls POST /auth/refresh
6. Diagnostics available at GET /api/auth/diagnostics
```

**New Endpoints:**
```
POST /auth/refresh
  Request: { refreshToken: "..." }
  Response: { accessToken: "...", expiresIn: 3600 }

GET /api/auth/diagnostics (protected, admin only)
  Response: {
    jwtConfigured: true,
    passwordHashSet: true,
    tokenExpiresIn: "24h",
    lastSuccessfulLogin: "2026-02-11T10:30:00Z",
    failedAttempts24h: 0
  }

POST /setup/change-password (protected, admin only)
  Request: { currentPassword: "...", newPassword: "..." }
  Response: { success: true, message: "Password updated" }
```

---

### 5. Observability Layer

**Integration Points:**

| Component | File | Integration Type |
|-----------|------|------------------|
| MetricsCollector | `lib/metrics.ts` | ENHANCE |
| Logger (gateway) | `lib/logger.ts` | ADD trace context |
| Logger (sync) | `utils/logger.ts` | ADD trace context |
| API routes | `routes/*.ts` | ADD metrics endpoint |
| Sync API client | `api-client/*.ts` | PROPAGATE trace headers |
| Gateway middleware | `middleware/` | INJECT trace context |

**Current Observability State:**
- `MetricsCollector` class tracks sync events, login events, entity stats
- In-memory storage (lost on restart)
- No Prometheus/OpenTelemetry integration
- Structured logging via Pino (JSON format in production)
- `X-Sync-ID`, `X-Query-ID` headers already used

**New Components:**
```
objetiva-sync-gateway/src/lib/
  observability/
    prometheus-exporter.ts  # Formats metrics for /metrics endpoint
    trace-context.ts        # Request tracing middleware

objetiva-sync/src/lib/
  observability/
    trace-propagation.ts    # Passes trace IDs to gateway
```

**Prometheus Metrics (example):**
```
# HELP gateway_sync_batches_total Total sync batches received
# TYPE gateway_sync_batches_total counter
gateway_sync_batches_total{entity="articulo",status="success"} 150
gateway_sync_batches_total{entity="articulo",status="partial"} 12
gateway_sync_batches_total{entity="articulo",status="failed"} 3

# HELP gateway_sync_records_total Total records processed
# TYPE gateway_sync_records_total counter
gateway_sync_records_total{entity="articulo",operation="insert"} 45000
gateway_sync_records_total{entity="articulo",operation="update"} 12000
gateway_sync_records_total{entity="articulo",operation="failed"} 50

# HELP gateway_sync_batch_duration_seconds Batch processing duration
# TYPE gateway_sync_batch_duration_seconds histogram
gateway_sync_batch_duration_seconds_bucket{le="0.5"} 100
gateway_sync_batch_duration_seconds_bucket{le="1"} 140
gateway_sync_batch_duration_seconds_bucket{le="5"} 160
```

**Trace Context Enhancement:**
```typescript
// Request middleware adds trace context
app.addHook('onRequest', (request, reply, done) => {
  const traceId = request.headers['x-trace-id'] || generateTraceId();
  const spanId = generateSpanId();
  request.traceContext = { traceId, spanId };
  reply.header('x-trace-id', traceId);
  done();
});

// Logger includes trace context
logger.info({
  traceId: request.traceContext.traceId,
  spanId: request.traceContext.spanId,
  syncId: metadata?.syncId,
  ...
}, 'Batch processed');
```

---

## Component Diagram (v1.1-rc2 Changes)

```
                                 v1.1-rc2 ADDITIONS
                                 (marked with +)
                                        |
+===============================================================================+
|                              objetiva-sync                                     |
+===============================================================================+
|                                                                               |
|  +----------------+     +-------------------+     +-------------------+        |
|  | Config Layer   |     | Adapter Layer     |     | Sync Layer        |        |
|  |                |     |                   |     |                   |        |
|  | - connection   |---->| - AbstractAdapter |---->| - SyncEngine      |        |
|  |   config repo  |     | - SQLServerAdapter|     | - Scheduler       |        |
|  | + postgres     |     | + PostgresAdapter |     | - BatchProcessor  |        |
|  |   config UI    |     |   [NEW]           |     | + trace context   |        |
|  +----------------+     +-------------------+     +-------------------+        |
|                                                           |                   |
|  +----------------+                                       |                   |
|  | Dashboard      |     +-------------------+             v                   |
|  | (HTMX+EJS)     |     | API Client        |     +-------------------+        |
|  | [NO CHANGES]   |     |                   |---->| Gateway Client    |        |
|  +----------------+     | - AuthManager     |     | + X-Origin-Source |        |
|                         | + RefreshToken    |     | + X-Trace-ID      |        |
|                         |   [NEW]           |     +-------------------+        |
|                         +-------------------+                                 |
+===============================================================================+
                                        |
                                   HTTP/JWT
                                        |
                                        v
+===============================================================================+
|                           objetiva-sync-gateway                               |
+===============================================================================+
|                                                                               |
|  +----------------+     +-------------------+     +-------------------+        |
|  | Auth Layer     |     | API Routes        |     | Ingestion Service |        |
|  |                |     |                   |     |                   |        |
|  | - auth.ts      |---->| - articulos.ts    |---->| - ingestArticulos |        |
|  | + diagnostics  |     | - comprobantes.ts |     | + origin tracking |        |
|  | + refresh      |     | + /metrics        |     |   [MODIFY]        |        |
|  |   [NEW]        |     |   [NEW]           |     +-------------------+        |
|  +----------------+     +-------------------+             |                   |
|                                                           v                   |
|  +----------------+     +-------------------+     +-------------------+        |
|  | Dashboard      |     | Lib Layer         |     | Prisma + PG       |        |
|  | (React)        |     |                   |     |                   |        |
|  | + shadcn/ui    |     | - metrics.ts      |     | + origin_source   |        |
|  |   [ENHANCE]    |     | + prometheus      |     | + origin_sync_id  |        |
|  | + origin view  |     | + trace context   |     | + origin_synced_at|        |
|  +----------------+     |   [NEW]           |     |   [ADD COLUMNS]   |        |
|                         +-------------------+     +-------------------+        |
+===============================================================================+
```

---

## Suggested Build Order

### Phase 1: PostgreSQL Adapter
**Priority:** HIGH | **Risk:** LOW | **Dependencies:** None

| Step | Component | Why |
|------|-----------|-----|
| 1.1 | PostgreSQLAdapter class | Clean extension, well-defined interface |
| 1.2 | Adapter registry update | Enables createAdapter('postgres') |
| 1.3 | Connection UI extension | Users can configure postgres sources |
| 1.4 | Integration tests | Verify adapter works with SyncEngine |

**Files created/modified:**
- `objetiva-sync/src/adapters/postgres/postgres-adapter.ts` (NEW)
- `objetiva-sync/src/adapters/postgres/index.ts` (NEW)
- `objetiva-sync/src/adapters/index.ts` (MODIFY - add registry)
- `objetiva-sync/src/dashboard/views/config/connection.ejs` (MODIFY - add postgres fields)

### Phase 2: Multi-Source Origin Tracking
**Priority:** HIGH | **Risk:** LOW | **Dependencies:** None (Phase 1 optional)

| Step | Component | Why |
|------|-----------|-----|
| 2.1 | Prisma schema columns | Database change first |
| 2.2 | Run migration | Apply to PostgreSQL |
| 2.3 | IngestionService changes | Accept and store origin |
| 2.4 | API route header extraction | Pass origin to ingestion |
| 2.5 | Zod schema updates | Add optional origin fields |

**Files created/modified:**
- `objetiva-sync-gateway/prisma/schema.prisma` (MODIFY - add columns)
- `objetiva-sync-gateway/src/services/ingestion.ts` (MODIFY)
- `objetiva-sync-gateway/src/routes/articulos.ts` (MODIFY)
- `objetiva-sync-gateway/src/routes/comprobantes.ts` (MODIFY)
- `shared/schemas/generated/*.ts` (REGENERATE)

### Phase 3: Auth Simplification
**Priority:** MEDIUM | **Risk:** LOW | **Dependencies:** None

| Step | Component | Why |
|------|-----------|-----|
| 3.1 | Token refresh endpoint | Better DX |
| 3.2 | Auth diagnostics endpoint | Easier troubleshooting |
| 3.3 | Setup enhancement | Password change without restart |
| 3.4 | Sync AuthManager update | Use refresh tokens |

**Files created/modified:**
- `objetiva-sync-gateway/src/routes/auth.ts` (MODIFY)
- `objetiva-sync-gateway/src/routes/setup.ts` (MODIFY)
- `objetiva-sync-gateway/src/lib/token-manager.ts` (NEW)
- `objetiva-sync/src/api-client/auth.ts` (MODIFY)

### Phase 4: Observability
**Priority:** MEDIUM | **Risk:** LOW | **Dependencies:** None

| Step | Component | Why |
|------|-----------|-----|
| 4.1 | Prometheus metrics exporter | Industry standard |
| 4.2 | /metrics endpoint | Scrape target |
| 4.3 | Trace context middleware | Request correlation |
| 4.4 | Logger enhancement | Include trace in logs |
| 4.5 | Sync trace propagation | Pass X-Trace-ID |

**Files created/modified:**
- `objetiva-sync-gateway/src/lib/observability/prometheus-exporter.ts` (NEW)
- `objetiva-sync-gateway/src/lib/observability/trace-context.ts` (NEW)
- `objetiva-sync-gateway/src/routes/metrics.ts` (NEW)
- `objetiva-sync-gateway/src/lib/logger.ts` (MODIFY)
- `objetiva-sync/src/api-client/*.ts` (MODIFY)

### Phase 5: Dashboard Modernization
**Priority:** LOW | **Risk:** MEDIUM | **Dependencies:** Phases 1-4 for full features

| Step | Component | Why |
|------|-----------|-----|
| 5.1 | shadcn/ui setup | Foundation |
| 5.2 | Replace custom components | Consistency |
| 5.3 | Add origin display | Show multi-source data |
| 5.4 | Add trace links | Navigate to logs |

**Files created/modified:**
- `objetiva-sync-gateway/dashboard/components.json` (NEW)
- `objetiva-sync-gateway/dashboard/src/components/ui/*.tsx` (NEW - shadcn)
- `objetiva-sync-gateway/dashboard/src/components/*.tsx` (MODIFY)

---

## Risk Assessment

| Feature | Technical Risk | Integration Risk | Mitigation |
|---------|---------------|------------------|------------|
| PostgreSQL Adapter | LOW | LOW | Follow SQLServerAdapter pattern exactly |
| Multi-Source Upsert | LOW | MEDIUM | Nullable columns, backward compatible |
| Auth Simplification | LOW | LOW | Additive endpoints, existing flow unchanged |
| Observability | LOW | LOW | Additive only, no changes to existing code |
| Dashboard shadcn | MEDIUM | LOW | Don't touch sync HTMX dashboard |

---

## Open Questions

1. **PostgreSQL Driver:** Use `pg` package directly, or use Prisma as read-only client?
   - **Recommendation:** Use `pg` for adapter consistency with SQLServerAdapter pattern

2. **Origin Source Format:** Free-form string, or constrained enum?
   - **Recommendation:** Free-form string, document conventions (e.g., `{type}-{identifier}`)

3. **Metrics Persistence:** Continue in-memory, or add Redis/persistent storage?
   - **Recommendation:** In-memory is fine; Prometheus scrapes frequently enough

4. **Trace ID Format:** UUID vs W3C Trace Context?
   - **Recommendation:** UUID for simplicity; W3C Trace Context if OpenTelemetry planned

---

## Previous Research Reference

This research builds on v1.0 schema-driven validation architecture (see prior content in this file for Phase 1-5 schema introspection design).

---

*Architecture Research: v1.1-rc2*
*Researched: 2026-02-11*
*Confidence: HIGH - Based on comprehensive codebase analysis of existing patterns*
