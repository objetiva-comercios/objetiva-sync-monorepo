# Objetiva Sync - Schema-Driven Synchronization Control

## What This Is

A schema-driven control system for the objetiva-sync monorepo that enforces PostgreSQL as the single source of truth for data synchronization between ERP systems and the gateway. Automatically regenerates Prisma/Zod schemas, validates SQL queries against actual database structure, and provides robust end-to-end testing across both sync and gateway modules.

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

### Active

<!-- New capabilities to build -->

- [ ] Gateway exposes `/api/schemas` endpoint returning current PostgreSQL table structures
- [ ] Sync queries gateway schemas endpoint to validate SQL queries before saving
- [ ] CLI command `regenerate-schemas` introspects PostgreSQL and updates Prisma/Zod schemas
- [ ] Enhanced query validator checks field names, types, and nullability against live schema
- [ ] Prisma schema automatically regenerates from PostgreSQL introspection
- [ ] Zod schemas automatically regenerate to match Prisma models
- [ ] Query administration panel validates against current schema before save
- [ ] Integration tests validate complete sync flow for all 4 entities
- [ ] Gateway logging accurately reflects successful/failed sync batches
- [ ] Dashboard displays schema validation errors with field-level detail
- [ ] Schema drift detection alerts when PostgreSQL changes vs cached schemas
- [ ] Visual confirmation in dashboard showing origin→destination data flow

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

**Current Pain Points:**
- Schema changes in PostgreSQL destination tables require manual updates across:
  1. Prisma schema file
  2. Zod validation schemas (multiple files)
  3. SQL extraction queries
  4. Gateway ingestion logic
- No automated validation of SQL queries against actual table structure
- Queries can be saved that will fail at runtime due to schema drift
- Logging refresh mechanism in gateway is unreliable for real-time monitoring
- Testing is fragmented, no end-to-end validation of full sync pipeline

**Prior Work:**
- Codebase already mapped in `.planning/codebase/` (ARCHITECTURE.md, STACK.md, STRUCTURE.md)
- Documentation exists in `objetiva-sync/docs/` but may be outdated
- Both modules functional but fragile when schemas change

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
| PostgreSQL as single source of truth | Destination schema is what ultimately matters for data integrity | — Pending |
| Gateway exposes schemas via HTTP | Sync needs access to schemas but runs on different server | — Pending |
| Manual regeneration command | User must consciously propagate schema changes, prevents accidents | — Pending |
| Distribute tooling between sync/gateway | Avoid third module complexity, leverage existing architecture | — Pending |

---
*Last updated: 2026-01-26 after initialization*
