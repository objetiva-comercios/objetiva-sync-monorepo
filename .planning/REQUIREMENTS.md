# Requirements: Objetiva Sync - Release Candidate

**Defined:** 2026-02-03
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## v1.1-rc Requirements

Requirements for release candidate. Each maps to roadmap phases.

### Sync Reliability

- [~] **SYNC-01**: Sync completes full dataset (100K+ records) without timeout or crash *(code complete, needs human test)*
- [x] **SYNC-02**: Timeout root cause identified and fixed (currently fails at ~60s) *(SSE heartbeat, bulk ingestion)*
- [x] **SYNC-03**: Sync error messages include root cause detail (not generic "Error al ejecutar") *(error-classifier.ts)*
- [~] **SYNC-04**: Large batch sizes (200, 500) work without degradation *(code complete, needs human test)*

### Incremental Sync

- [ ] **INCR-01**: Sync tracks last successful sync timestamp per entity
- [ ] **INCR-02**: Subsequent syncs fetch only records modified since last sync
- [ ] **INCR-03**: Incremental sync works reliably for all 4 entity types
- [ ] **INCR-04**: Full sync remains available as manual override option

### Tech Debt & Cleanup

- [ ] **DEBT-01**: Gateway compiles with zero TypeScript errors
- [ ] **DEBT-02**: Ingestion uses generated schemas instead of manual imports
- [ ] **DEBT-03**: Remove temporary scripts, isolated .md files, and development garbage
- [ ] **DEBT-04**: Clean unused backup files and debug artifacts across both modules

### Deployment

- [ ] **DEPL-01**: Deployment scripts for both sync and gateway modules
- [ ] **DEPL-02**: Environment configuration templates (.env.example) complete and documented

### Robustness

- [ ] **ROBU-01**: End-to-end workflow validated: schema change → regeneration → validation → sync
- [ ] **ROBU-02**: Error recovery works across the pipeline (retry, graceful degradation)

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Advanced Validation (from v1.0 backlog)

- **VALID-09**: Schema version checking between sync and gateway
- **VALID-10**: Fuzzy matching for field name suggestions
- **VALID-11**: Dynamic SQL validation at runtime
- **VALID-12**: Parameterized query type validation

### CLI Enhancements (from v1.0 backlog)

- **CLI-08**: Automated staleness detection with pre-commit hooks
- **CLI-09**: Schema drift detection comparing current vs snapshot
- **CLI-10**: Breaking vs non-breaking change classification

### Performance & Monitoring (from v1.0 backlog)

- **PERF-01**: Schema endpoint response time monitoring
- **PERF-02**: Query validation latency tracking
- **PERF-03**: Cache hit/miss rate metrics
- **PERF-04**: Schema introspection duration tracking

### Distributed System Features (from v1.0 backlog)

- **DIST-01**: Circuit breaker for schema endpoint failures
- **DIST-02**: Graceful degradation when gateway unreachable
- **DIST-03**: Schema version handshake between services
- **DIST-04**: Event-driven cache invalidation via PostgreSQL NOTIFY

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automatic query rewriting | Too risky, user must review changes |
| Real-time schema synchronization | Manual control preferred |
| Multi-environment management | Single production environment |
| Full monitoring dashboard overhaul | Current React dashboard sufficient for RC |
| Database migration tooling | Use existing Prisma Migrate |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SYNC-01 | Phase 8: Sync Reliability | Human Test |
| SYNC-02 | Phase 8: Sync Reliability | Complete |
| SYNC-03 | Phase 8: Sync Reliability | Complete |
| SYNC-04 | Phase 8: Sync Reliability | Human Test |
| INCR-01 | Phase 10: Incremental Sync | Pending |
| INCR-02 | Phase 10: Incremental Sync | Pending |
| INCR-03 | Phase 10: Incremental Sync | Pending |
| INCR-04 | Phase 10: Incremental Sync | Pending |
| DEBT-01 | Phase 9: Tech Debt Cleanup | Pending |
| DEBT-02 | Phase 9: Tech Debt Cleanup | Pending |
| DEBT-03 | Phase 9: Tech Debt Cleanup | Pending |
| DEBT-04 | Phase 9: Tech Debt Cleanup | Pending |
| DEPL-01 | Phase 11: Deployment Configuration | Pending |
| DEPL-02 | Phase 11: Deployment Configuration | Pending |
| ROBU-01 | Phase 12: End-to-End Robustness | Pending |
| ROBU-02 | Phase 12: End-to-End Robustness | Pending |

**Coverage:**
- v1.1-rc requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-02-03*
*Last updated: 2026-02-03 after roadmap creation*
