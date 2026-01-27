# Requirements: Objetiva Sync - Schema-Driven Control

**Defined:** 2026-01-26
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## v1 Requirements

### Gateway Schema Endpoint

- [ ] **SCHEMA-01**: Gateway exposes GET /api/schemas endpoint returning all entity schemas
- [ ] **SCHEMA-02**: Gateway exposes GET /api/schemas/:entity endpoint for single entity
- [ ] **SCHEMA-03**: Schema endpoints require JWT authentication
- [ ] **SCHEMA-04**: Schema responses cached with 1-hour TTL
- [x] **SCHEMA-05**: Schema metadata includes column names, types, nullability, constraints

### CLI Introspection & Regeneration

- [ ] **CLI-01**: CLI command `npm run regenerate-schemas` introspects PostgreSQL
- [ ] **CLI-02**: CLI generates/updates prisma/schema.prisma from introspection
- [ ] **CLI-03**: CLI automatically runs `prisma generate` after schema update
- [ ] **CLI-04**: CLI generates Zod schemas from Prisma models
- [ ] **CLI-05**: CLI displays diff summary before writing files
- [ ] **CLI-06**: CLI supports dry-run mode to preview changes
- [ ] **CLI-07**: CLI supports entity-specific regeneration flag

### Sync Query Validation

- [ ] **VALID-01**: Sync fetches schemas from gateway /api/schemas endpoint
- [ ] **VALID-02**: Sync caches schemas locally with TTL-based refresh
- [ ] **VALID-03**: Query validator validates SQL structure against live schema
- [ ] **VALID-04**: Validator detects missing required fields
- [ ] **VALID-05**: Validator detects unexpected extra fields
- [ ] **VALID-06**: Validator detects field type mismatches
- [ ] **VALID-07**: Validator provides field-level error messages with suggestions
- [ ] **VALID-08**: Query validation runs before saving query in dashboard

### Integration Testing

- [ ] **TEST-01**: Integration test for articulos full sync flow
- [ ] **TEST-02**: Integration test for comprobantes_cabecera full sync flow
- [ ] **TEST-03**: Integration test for comprobantes_detalle full sync flow
- [ ] **TEST-04**: Integration test for comprobantes_pagos full sync flow
- [ ] **TEST-05**: Test schema change propagation (add column scenario)
- [ ] **TEST-06**: Test validation error reporting and formatting

### Gateway Logging

- [ ] **LOG-01**: Gateway accurately logs successful batch ingestion
- [ ] **LOG-02**: Gateway accurately logs failed batch ingestion with errors
- [ ] **LOG-03**: Gateway dashboard displays sync logs in real-time
- [ ] **LOG-04**: Log refresh mechanism works reliably without complex polling

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
| SCHEMA-01 | Phase 2 | Pending |
| SCHEMA-02 | Phase 2 | Pending |
| SCHEMA-03 | Phase 2 | Pending |
| SCHEMA-04 | Phase 2 | Pending |
| SCHEMA-05 | Phase 1 | Complete |
| CLI-01 | Phase 3 | Pending |
| CLI-02 | Phase 3 | Pending |
| CLI-03 | Phase 3 | Pending |
| CLI-04 | Phase 3 | Pending |
| CLI-05 | Phase 3 | Pending |
| CLI-06 | Phase 3 | Pending |
| CLI-07 | Phase 3 | Pending |
| VALID-01 | Phase 4 | Pending |
| VALID-02 | Phase 4 | Pending |
| VALID-03 | Phase 4 | Pending |
| VALID-04 | Phase 4 | Pending |
| VALID-05 | Phase 4 | Pending |
| VALID-06 | Phase 4 | Pending |
| VALID-07 | Phase 4 | Pending |
| VALID-08 | Phase 4 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |
| TEST-03 | Phase 5 | Pending |
| TEST-04 | Phase 5 | Pending |
| TEST-05 | Phase 5 | Pending |
| TEST-06 | Phase 5 | Pending |
| LOG-01 | Phase 5 | Pending |
| LOG-02 | Phase 5 | Pending |
| LOG-03 | Phase 5 | Pending |
| LOG-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-26 after roadmap creation*
