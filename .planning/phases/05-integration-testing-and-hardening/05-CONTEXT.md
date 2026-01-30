# Phase 5: Integration Testing & Hardening - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

End-to-end validation of the complete schema-driven sync pipeline with production-ready monitoring. Validates that schema changes propagate correctly through introspection → distribution → regeneration → validation → execution. Establishes observability for production debugging and operational confidence.

</domain>

<decisions>
## Implementation Decisions

### Test Coverage & Scenarios
- All 4 sync entities must have integration test coverage (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos)
- Schema change testing uses actual database migrations (real ALTER TABLE commands in test database)
- Full CLI roundtrip testing: schema change → CLI regenerate → Prisma/Zod update → validation uses new schema
- Critical failure scenarios to validate:
  - Gateway unavailable during sync (graceful degradation)
  - Invalid query saved to configuration (validation catches before execution)
  - Additional failure modes determined by Claude based on risk analysis

### Test Execution Environment
- Full cleanup every run: drop and recreate test database between runs for pristine state
- Tests run locally on developer machines (npm test)
- Test data management strategy: Claude decides (fixtures, factories, or hybrid)
- Database approach: Claude decides between separate test database vs mock (prioritize realism for PostgreSQL behavior)

### Log Detail & Structure
- Human-readable text format for production logs (not structured JSON)
- Standard verbosity by default: errors + success + warnings (not minimal, not debug)
- Failed batch ingestion logs must include:
  - Field-level validation errors with specific error messages
  - Sample failed records (first few that caused failure)
  - Schema mismatch details (expected vs actual field names/types)
- Successful batch ingestion log content: Claude decides (entity name, count, timing, query details)

### Dashboard Log Display
- Real-time updates via WebSocket or Server-Sent Events (not polling or manual refresh)
- Filtering support:
  - Filter by entity (articulos, comprobantes_cabecera, etc.)
  - Filter by severity (errors, success, warnings)
- Display all logs from last 24 hours (time-based window with pagination for older)
- 7-day log retention period

### Claude's Discretion
- Specific test data strategy (fixtures vs factories vs hybrid)
- Whether to use separate test database or mocking approach
- Success log content details (what metrics/timing to include)
- Additional failure scenarios beyond the two specified
- Exact implementation of WebSocket/SSE for real-time updates

</decisions>

<specifics>
## Specific Ideas

- "Full CLI roundtrip" means: make a schema change → run regenerate-schemas → verify Prisma/Zod files update → verify validation uses new schema immediately
- Schema change testing should be realistic (actual ALTER TABLE) not mocked responses
- Real-time log updates are important for operational confidence

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-integration-testing-and-hardening*
*Context gathered: 2026-01-30*
