# Objetiva Sync - Schema-Driven Synchronization Control

## What This Is

A production-ready schema-driven synchronization system for the objetiva-sync monorepo. Enforces PostgreSQL as the single source of truth for ERP-to-gateway data synchronization. Features automated Prisma/Zod schema regeneration, SQL query validation against live database structure, incremental sync with clock skew protection, and comprehensive deployment automation.

## Core Value

PostgreSQL schema changes propagate correctly through the entire synchronization pipeline without breaking queries, validation, or data ingestion.

## Requirements

### Validated

<!-- Existing capabilities from current codebase -->

- ✓ Pull-based ETL synchronization from SQL Server to PostgreSQL — existing
- ✓ 4 entity types syncing (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos) — existing
- ✓ Adapter pattern for multiple data sources (SQL Server, PostgreSQL, MySQL, Excel) — existing
- ✓ Query-driven synchronization with configuration-based SQL queries — existing
- ✓ Web dashboard (HTMX + EJS) for configuration and monitoring — existing
- ✓ Batch processing with retry queue and exponential backoff — existing
- ✓ Zod schema validation for data transformation — existing
- ✓ Prisma ORM persistence in PostgreSQL gateway — existing
- ✓ JWT authentication between sync and gateway — existing
- ✓ Session-based auth for dashboard — existing
- ✓ Scheduled automatic synchronization via node-cron — existing
- ✓ SQLite state management for sync configuration — existing
- ✓ API client with entity-specific endpoints — existing
- ✓ Drizzle ORM for local SQLite database — existing
- ✓ Gateway exposes `/api/schemas` endpoint returning current PostgreSQL table structures — v1.0
- ✓ Sync queries gateway schemas endpoint to validate SQL queries before saving — v1.0
- ✓ CLI command `regenerate-schemas` introspects PostgreSQL and updates Prisma/Zod schemas — v1.0
- ✓ Enhanced query validator checks field names, types, and nullability against live schema — v1.0
- ✓ Prisma schema automatically regenerates from PostgreSQL introspection — v1.0
- ✓ Zod schemas automatically regenerate to match Prisma models — v1.0
- ✓ Query administration panel validates against current schema before save — v1.0
- ✓ Integration tests validate complete sync flow for all 4 entities — v1.0
- ✓ Gateway logging accurately reflects successful/failed sync batches — v1.0
- ✓ Dashboard displays schema validation errors with field-level detail — v1.0
- ✓ Real-time monitoring dashboard with SSE log streaming — v1.0
- ✓ React dashboard with metrics, batch operations, and activity feed — v1.0

<!-- v1.1-rc additions -->

- ✓ Sync timeout fixed with SSE heartbeat and bulk ingestion optimization — v1.1-rc
- ✓ Error messages include root cause detail (not generic "Error al ejecutar") — v1.1-rc
- ✓ Incremental sync with per-entity timestamp tracking — v1.1-rc
- ✓ Clock skew protection (5-minute overlap) for incremental queries — v1.1-rc
- ✓ Full sync override available via dashboard checkbox — v1.1-rc
- ✓ Gateway compiles with zero TypeScript errors — v1.1-rc
- ✓ Ingestion uses generated schemas (not manual imports) — v1.1-rc
- ✓ PM2 deployment scripts for both modules — v1.1-rc
- ✓ .env.example files with complete variable documentation — v1.1-rc
- ✓ 79 integration tests covering error recovery and pipeline validation — v1.1-rc
- ✓ Multi-source query support: each query can specify its own database connection — v1.1-rc2
- ✓ Adapter pool for managing multiple concurrent database connections — v1.1-rc2
- ✓ Connection selector in query configuration UI — v1.1-rc2

<!-- v1.1-rc2 Multi-Source & Hardening additions -->

- ✓ PostgreSQL adapter implementing IDataSourceAdapter for data extraction — v1.1-rc2
- ✓ Adapter registry supporting multiple registered adapters (SQL Server + PostgreSQL) — v1.1-rc2
- ✓ Origin tracking columns (origin_source, origin_sync_id, origin_synced_at) in all entity tables — v1.1-rc2
- ✓ X-Origin-Source header extraction and storage in ingestion service — v1.1-rc2
- ✓ Last-write-wins conflict resolution based on origin_synced_at — v1.1-rc2
- ✓ Per-source sync state tracking (sourceId in sync_state) — v1.1-rc2
- ✓ Conflict logging when two sources modify same record within overlap window — v1.1-rc2
- ✓ Token refresh endpoint (/auth/refresh) for long-running syncs — v1.1-rc2
- ✓ Auth diagnostics endpoint (/api/auth/diagnostics) for troubleshooting — v1.1-rc2
- ✓ Clear, specific error messages for auth failures (TOKEN_EXPIRED, TOKEN_INVALID, TOKEN_MISSING) — v1.1-rc2
- ✓ Password change endpoint with bcrypt verification — v1.1-rc2
- ✓ Client-side token refresh in AuthManager — v1.1-rc2
- ✓ Correlation ID infrastructure (X-Correlation-ID header propagation) — v1.1-rc2
- ✓ Prometheus metrics export (/metrics) with gateway_ prefix — v1.1-rc2
- ✓ Sync-specific metrics (duration histogram, record counter per entity) — v1.1-rc2
- ✓ Health check endpoint (/health) with component probes — v1.1-rc2

### Active

<!-- Human acceptance testing for v1.1 stable -->

- [ ] Human verification: 100K+ record sync completes without timeout (SYNC-01)
- [ ] Human verification: Batch sizes 200/500 work without degradation (SYNC-04)
- [ ] Human verification: Incremental sync with live database
- [ ] Human verification: Real PostgreSQL schema change E2E

### Out of Scope

- Real-time automatic schema regeneration (manual command is sufficient) — too complex, manual control preferred
- Third control module in monorepo — adds unnecessary complexity, distribute tooling instead
- Automatic query rewriting when schemas change — too risky, user must review changes
- Schema versioning system — not needed for single-team project
- Migration rollback capabilities — PostgreSQL migrations are source of truth
- Multi-environment schema management — single production environment

## Context

**Technical Environment:**
- Monorepo with two TypeScript applications (objetiva-sync + objetiva-sync-gateway)
- Sync extracts from SQL Server via MSSQL driver, transforms via Zod, pushes to gateway
- Gateway receives batches via Fastify REST API, persists with Prisma to PostgreSQL
- Physical separation: sync and gateway run on different servers
- 4 entity types with distinct schemas and synchronization requirements

**Current State (after v1.1-rc):**
- 29,257 lines of TypeScript across both modules
- All v1.1-rc code complete, 79 integration tests passing
- Gateway compiles cleanly with zero TypeScript errors
- PM2 deployment automation ready for production
- 2 requirements pending human acceptance testing with production data

**Prior Work:**
- Codebase mapped in `.planning/codebase/` (ARCHITECTURE.md, STACK.md, STRUCTURE.md)
- Documentation in `objetiva-sync/docs/`
- Deployment guides in `objetiva-sync-gateway/DEPLOYMENT.md`

## Constraints

- **Physical Deployment**: Sync and gateway on separate servers — gateway must expose schemas via HTTP endpoint
- **Tech Stack**: TypeScript, Fastify, Prisma, Zod, Drizzle — no framework changes allowed
- **Database**: PostgreSQL is authoritative, SQLite for sync state — cannot change database engines
- **Backwards Compatibility**: Existing sync configurations must continue working — no breaking changes to SQLite schema
- **Manual Trigger**: Schema regeneration command-driven, not automatic — user controls when to regenerate
- **Security**: Schema endpoint must be authenticated — reuse existing JWT mechanism

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PostgreSQL as single source of truth | Destination schema is what ultimately matters for data integrity | ✓ Good (v1.0) |
| Gateway exposes schemas via HTTP | Sync needs access to schemas but runs on different server | ✓ Good (v1.0) |
| Manual regeneration command | User must consciously propagate schema changes, prevents accidents | ✓ Good (v1.0) |
| Distribute tooling between sync/gateway | Avoid third module complexity, leverage existing architecture | ✓ Good (v1.0) |
| SSE heartbeat for long-running syncs | Prevents nginx/proxy timeout on large dataset syncs | ✓ Good (v1.1-rc) |
| Bulk createMany for ingestion | Replaces N+1 queries, fixes timeout on large batches | ✓ Good (v1.1-rc) |
| Clock skew protection for incremental | 5-minute overlap prevents missed records from ERP/gateway clock differences | ✓ Good (v1.1-rc) |
| PM2 fork mode for gateway | Cluster mode breaks SSE streaming, fork mode required | ✓ Good (v1.1-rc) |
| pg library Pool for PostgreSQL | Industry standard with proven reliability, matches SQL Server pool pattern | ✓ Good (v1.1-rc2) |
| @param to $1 parameter conversion | Transparent SQL dialect translation in adapter layer | ✓ Good (v1.1-rc2) |
| Origin columns nullable | Existing records without origin tracking remain valid (backwards compatible) | ✓ Good (v1.1-rc2) |
| Last-write-wins conflict resolution | Best-effort conflict detection without blocking ingestion | ✓ Good (v1.1-rc2) |
| Token refresh before expiration | Long-running syncs renew tokens via AuthManager without re-login | ✓ Good (v1.1-rc2) |
| Prometheus custom registry | Isolated metrics for testing without conflicts | ✓ Good (v1.1-rc2) |
| 3-second health probe timeout | Kubernetes expects 5s max, 3s probe + 2s margin | ✓ Good (v1.1-rc2) |
| Rollback Phase 17 shadcn dashboard | Implementation issues, HTMX dashboard functional | ⚠️ Revisit (v1.1-rc2) |

## Completed Milestones

| Milestone | Goal | Completed | Archive |
|-----------|------|-----------|---------|
| v1.0 | Schema-driven synchronization control | 2026-02-03 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1-rc | Release candidate with sync reliability | 2026-02-05 | `.planning/milestones/v1.1-rc-ROADMAP.md` |
| v1.1-rc2 | Multi-source sync & hardening | 2026-02-18 | `.planning/milestones/v1.1-rc2-ROADMAP.md` |

## Current Milestone: v1.2 Setup & Pairing

**Goal:** Simplificar radicalmente la instalación del gateway y el enlace sync↔gateway.

**Target features:**
- Pairing con código de enlace: gateway genera código corto, sync lo consume y quedan enlazados automáticamente
- Setup page mejorada del gateway: wizard paso a paso que genera el .env completo
- Checklist de pre-vuelo que valida cada parámetro antes de arrancar Docker
- Variables de entorno unificadas en .env para docker-compose (subdominio Traefik, PostgreSQL, credenciales, JWT)

**Context:**
- Sync se instala primero (Windows), gateway después (VPS/Docker)
- El setup page del sync no requiere cambios
- Ambos sistemas se conectan via Tailscale

---
*Last updated: 2026-03-04 after v1.2 milestone started*
