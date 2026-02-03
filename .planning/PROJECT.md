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

### Active

<!-- Milestone v1.1-rc: Release Candidate -->

- [ ] Sync completes full 100K+ record sets without timeout or crash
- [ ] Incremental sync (timestamp-based) works reliably for delta updates
- [ ] Gateway compiles cleanly with zero TypeScript errors
- [ ] Ingestion uses generated schemas instead of manual imports
- [ ] Production deployment scripts and environment configuration
- [ ] Improved error handling and recovery across the pipeline
- [ ] End-to-end robustness validation of full workflow

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

**Current Pain Points (v1.1-rc):**
- Manual sync fails after ~60 seconds regardless of batch size (timeout somewhere in pipeline)
- Incremental sync (timestamp-based) exists but untested for reliability
- Gateway has pre-existing TypeScript compilation errors (Prisma/Fastify types)
- Ingestion imports manual schemas instead of generated ones (architectural inconsistency)
- No production deployment scripts or environment configuration

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
| PostgreSQL as single source of truth | Destination schema is what ultimately matters for data integrity | Implemented (v1.0) |
| Gateway exposes schemas via HTTP | Sync needs access to schemas but runs on different server | Implemented (v1.0) |
| Manual regeneration command | User must consciously propagate schema changes, prevents accidents | Implemented (v1.0) |
| Distribute tooling between sync/gateway | Avoid third module complexity, leverage existing architecture | Implemented (v1.0) |

## Completed Milestones

| Milestone | Goal | Completed | Archive |
|-----------|------|-----------|---------|
| v1.0 | Schema-driven synchronization control | 2026-02-03 | `.planning/archive/v1.0-MILESTONE.md` |

## Current Milestone: v1.1-rc Release Candidate

**Goal:** Make the sync system production-ready — fix the sync timeout bug, harden incremental sync, resolve all TypeScript errors, and validate end-to-end robustness.

**Target features:**
- Fix sync timeout (~60s failure on large datasets)
- Reliable incremental sync with timestamp-based deltas
- Clean TypeScript compilation (gateway)
- Production deployment configuration
- End-to-end robustness testing of full workflow

---
*Last updated: 2026-02-03 after v1.1-rc milestone start*
