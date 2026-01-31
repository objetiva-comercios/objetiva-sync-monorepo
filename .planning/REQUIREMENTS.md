# Requirements: Objetiva Sync - Schema-Driven Control

**Defined:** 2026-01-26
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## v1 Requirements

### Gateway Schema Endpoint

- [x] **SCHEMA-01**: Gateway exposes GET /api/schemas endpoint returning all entity schemas
- [x] **SCHEMA-02**: Gateway exposes GET /api/schemas/:entity endpoint for single entity
- [x] **SCHEMA-03**: Schema endpoints require JWT authentication
- [x] **SCHEMA-04**: Schema responses cached with 1-hour TTL
- [x] **SCHEMA-05**: Schema metadata includes column names, types, nullability, constraints

### CLI Introspection & Regeneration

- [x] **CLI-01**: CLI command `npm run regenerate-schemas` introspects PostgreSQL
- [x] **CLI-02**: CLI generates/updates prisma/schema.prisma from introspection
- [x] **CLI-03**: CLI automatically runs `prisma generate` after schema update
- [x] **CLI-04**: CLI generates Zod schemas from Prisma models
- [x] **CLI-05**: CLI displays diff summary before writing files
- [x] **CLI-06**: CLI supports dry-run mode to preview changes
- [x] **CLI-07**: CLI supports entity-specific regeneration flag

### Sync Query Validation

- [x] **VALID-01**: Sync fetches schemas from gateway /api/schemas endpoint
- [x] **VALID-02**: Sync caches schemas locally with TTL-based refresh
- [x] **VALID-03**: Query validator validates SQL structure against live schema
- [x] **VALID-04**: Validator detects missing required fields
- [x] **VALID-05**: Validator detects unexpected extra fields
- [x] **VALID-06**: Validator detects field type mismatches
- [x] **VALID-07**: Validator provides field-level error messages with suggestions
- [x] **VALID-08**: Query validation runs before saving query in dashboard

### Integration Testing

- [x] **TEST-01**: Integration test for articulos full sync flow
- [x] **TEST-02**: Integration test for comprobantes_cabecera full sync flow
- [x] **TEST-03**: Integration test for comprobantes_detalle full sync flow
- [x] **TEST-04**: Integration test for comprobantes_pagos full sync flow
- [x] **TEST-05**: Test schema change propagation (add column scenario)
- [x] **TEST-06**: Test validation error reporting and formatting

### Gateway Logging

- [x] **LOG-01**: Gateway accurately logs successful batch ingestion
- [x] **LOG-02**: Gateway accurately logs failed batch ingestion with errors
- [x] **LOG-03**: Gateway dashboard displays sync logs in real-time
- [x] **LOG-04**: Log refresh mechanism works reliably without complex polling

## v2 Requirements

### Advanced Validation

- **VALID-09**: Schema version checking between sync and gateway
- **VALID-10**: Fuzzy matching for field name suggestions
- **VALID-11**: Dynamic SQL validation at runtime
- **VALID-12**: Parameterized query type validation

### CLI Enhancements

- **CLI-08**: Automated staleness detection with pre-commit hooks
- **CLI-09**: Schema drift detection comparing current vs snapshot
- **CLI-10**: Breaking vs non-breaking change classification

### Performance & Monitoring

- **PERF-01**: Schema endpoint response time monitoring
- **PERF-02**: Query validation latency tracking
- **PERF-03**: Cache hit/miss rate metrics
- **PERF-04**: Schema introspection duration tracking

### Distributed System Features

- **DIST-01**: Circuit breaker for schema endpoint failures
- **DIST-02**: Graceful degradation when gateway unreachable
- **DIST-03**: Schema version handshake between services
- **DIST-04**: Event-driven cache invalidation via PostgreSQL NOTIFY

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic query rewriting | High complexity, low reliability - better to fail loudly than fix incorrectly |
| Real-time schema synchronization | Schema changes should be deliberate, not reactive - requires manual trigger for safety |
| Automatic migration generation | Database migrations are high-risk - use existing Prisma Migrate tools |
| Schema rollback/time travel | Database-level feature - use PostgreSQL backups instead |
| Visual schema editor | Sync system consumes schema, doesn't author it - use pgAdmin/DBeaver |
| Multi-database schema unification | Out of scope for PostgreSQL-specific system - adds unnecessary complexity |
| Embedded SQL query builder | Users already write SQL - validation is goal, not query construction |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 2 | Complete |
| SCHEMA-02 | Phase 2 | Complete |
| SCHEMA-03 | Phase 2 | Complete |
| SCHEMA-04 | Phase 2 | Complete |
| SCHEMA-05 | Phase 1 | Complete |
| CLI-01 | Phase 3 | Complete |
| CLI-02 | Phase 3 | Complete |
| CLI-03 | Phase 3 | Complete |
| CLI-04 | Phase 3 | Complete |
| CLI-05 | Phase 3 | Complete |
| CLI-06 | Phase 3 | Complete |
| CLI-07 | Phase 3 | Complete |
| VALID-01 | Phase 4 | Complete |
| VALID-02 | Phase 4 | Complete |
| VALID-03 | Phase 4 | Complete |
| VALID-04 | Phase 4 | Complete |
| VALID-05 | Phase 4 | Complete |
| VALID-06 | Phase 4 | Complete |
| VALID-07 | Phase 4 | Complete |
| VALID-08 | Phase 4 | Complete |
| TEST-01 | Phase 5 | Complete |
| TEST-02 | Phase 5 | Complete |
| TEST-03 | Phase 5 | Complete |
| TEST-04 | Phase 5 | Complete |
| TEST-05 | Phase 5 | Complete |
| TEST-06 | Phase 5 | Complete |
| LOG-01 | Phase 5 | Complete |
| LOG-02 | Phase 5 | Complete |
| LOG-03 | Phase 5 | Complete |
| LOG-04 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-31 after Phase 5 completion*
