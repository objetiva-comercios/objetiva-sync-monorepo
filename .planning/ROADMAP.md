# Roadmap: Objetiva Sync - Schema-Driven Control

## Overview

This roadmap establishes PostgreSQL as the single source of truth for schema validation across the distributed sync system. Starting with introspection foundations in the gateway, we build outward to HTTP schema distribution, automated code generation, enhanced runtime validation in the sync service, and finally comprehensive testing with production hardening. Each phase delivers independently verifiable capabilities that prevent schema drift from breaking the synchronization pipeline.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema Introspection Foundation** - Gateway reads and normalizes PostgreSQL metadata
- [x] **Phase 2: Schema Distribution Endpoint** - Gateway exposes authenticated schema API
- [x] **Phase 3: CLI Code Regeneration** - Automated Prisma/Zod schema generation from PostgreSQL
- [x] **Phase 4: Enhanced Query Validation** - Sync validates queries against live gateway schemas
- [x] **Phase 5: Integration Testing & Hardening** - End-to-end validation and production reliability
- [ ] **Phase 6: CLI E2E Verification** - Verify regenerate-schemas command executes successfully end-to-end

## Phase Details

### Phase 1: Schema Introspection Foundation
**Goal**: Gateway can programmatically extract complete PostgreSQL schema metadata for all sync entities
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-05
**Success Criteria** (what must be TRUE):
  1. Gateway can query PostgreSQL information_schema and pg_catalog for table structures
  2. Schema metadata includes column names, data types, nullability, and constraints for all 4 sync entities
  3. Introspection service handles PostgreSQL-specific types (DECIMAL, JSONB, arrays) correctly
  4. Schema metadata is normalized into consistent JSON structure
  5. Introspection failures are logged with connection retry logic
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md - Infrastructure: types, schemas, db pool, retry wrapper
- [x] 01-02-PLAN.md - Introspection service with SQL queries and entity config

### Phase 2: Schema Distribution Endpoint
**Goal**: Sync service running on remote server can fetch current schema metadata via HTTP
**Depends on**: Phase 1
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04
**Success Criteria** (what must be TRUE):
  1. GET /api/schemas endpoint returns all entity schemas with JWT authentication
  2. GET /api/schemas/:entity endpoint returns single entity schema
  3. Schema responses are cached with 1-hour TTL to prevent database load
  4. Unauthorized requests receive 401 responses
  5. Schema endpoint responds in under 100ms on cache hit
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md -- Schema cache service + authenticated route + app registration

### Phase 3: CLI Code Regeneration
**Goal**: Developer can regenerate Prisma and Zod schemas from PostgreSQL with single command
**Depends on**: Phase 2
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07
**Success Criteria** (what must be TRUE):
  1. CLI command `npm run regenerate-schemas` introspects PostgreSQL and updates schema files
  2. Prisma schema (schema.prisma) regenerates from introspection with correct models
  3. Zod validation schemas regenerate automatically from Prisma models
  4. CLI displays diff summary showing schema changes before writing files
  5. CLI supports --dry-run flag to preview changes without modifying files
  6. CLI supports --entity flag to regenerate specific entity schemas only
  7. Generated Zod schemas match PostgreSQL column types and nullability
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Code generation modules: types, diff display, Prisma generator, Zod generator
- [x] 03-02-PLAN.md -- CLI orchestrator, entry point script, npm script registration
- [x] 03-03-PLAN.md -- Phase verification testing

### Phase 4: Enhanced Query Validation
**Goal**: Sync service validates SQL queries against live schema before execution preventing runtime failures
**Depends on**: Phase 3
**Requirements**: VALID-01, VALID-02, VALID-03, VALID-04, VALID-05, VALID-06, VALID-07, VALID-08
**Success Criteria** (what must be TRUE):
  1. Sync fetches schemas from gateway /api/schemas endpoint on startup
  2. Schema cache refreshes automatically based on TTL without manual intervention
  3. Query validator detects missing required fields before query execution
  4. Query validator detects unexpected extra fields not in schema
  5. Query validator detects field type mismatches (e.g., string vs number)
  6. Validation errors show field-level detail with suggestions (e.g., "Did you mean customer_id?")
  7. Dashboard query administration panel validates queries before saving
  8. Invalid queries cannot be saved to sync configuration
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- Schema cache service for sync (gateway client, TTL caching)
- [x] 04-02-PLAN.md -- Schema validator with suggestions, dashboard save integration

### Phase 5: Integration Testing & Hardening
**Goal**: Complete sync pipeline validated end-to-end with reliable monitoring for production deployment
**Depends on**: Phase 4
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, LOG-01, LOG-02, LOG-03, LOG-04
**Success Criteria** (what must be TRUE):
  1. Integration tests validate full sync flow for all 4 entities (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
  2. Test suite includes schema change scenario (add column) with automatic validation propagation
  3. Validation error reporting formats correctly in test assertions
  4. Gateway logs successful batch ingestion with entity counts
  5. Gateway logs failed batch ingestion with field-level error details
  6. Dashboard displays real-time sync logs without manual refresh
  7. Log refresh mechanism works reliably with consistent latency
**Plans**: 5 plans

Plans:
- [x] 05-01-PLAN.md -- Integration test infrastructure + 4 entity sync flow tests
- [x] 05-02-PLAN.md -- Schema change propagation + validation error tests
- [x] 05-03-PLAN.md -- Gateway logging enhancement for batch ingestion
- [x] 05-04-PLAN.md -- SSE real-time log streaming + dashboard updates
- [x] 05-05-PLAN.md -- Gap closure: fix blocking bugs in sync-logs-repo and SSE test setup

### Phase 6: CLI E2E Verification
**Goal**: Verify CLI regenerate-schemas command executes successfully end-to-end with running gateway
**Depends on**: Phase 3, Phase 5
**Requirements**: CLI-01 (runtime verification), CLI-03 (runtime verification)
**Gap Closure**: Closes Phase 3 verification gap from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. Gateway starts successfully with PostgreSQL connection established
  2. Environment variables (GATEWAY_URL, SYNC_USERNAME, SYNC_PASSWORD) configured correctly
  3. CLI authenticates successfully with gateway and receives JWT token
  4. CLI fetches all entity schemas from /api/schemas endpoint
  5. --dry-run mode displays diffs without modifying files
  6. CLI writes schema.prisma and Zod files when run without --dry-run
  7. prisma generate executes successfully and outputs "Generated Prisma Client"
  8. Generated files match expected structure from Phase 3 code review
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md -- CLI E2E test infrastructure + integration tests with human verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Introspection Foundation | 2/2 | Complete | 2026-01-27 |
| 2. Schema Distribution Endpoint | 1/1 | Complete | 2026-01-27 |
| 3. CLI Code Regeneration | 3/3 | Complete | 2026-01-30 |
| 4. Enhanced Query Validation | 2/2 | Complete | 2026-01-30 |
| 5. Integration Testing & Hardening | 5/5 | Complete | 2026-01-31 |
| 6. CLI E2E Verification | 0/1 | Pending | - |
