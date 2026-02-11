# Requirements: v1.1-rc2 — Multi-Source & Hardening

**Project:** objetiva-sync-monorepo
**Milestone:** v1.1-rc2
**Created:** 2026-02-11

## Requirements Matrix

### Multi-Source Sync (Priority 1)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| MSS-01 | PostgreSQL adapter implementing IDataSourceAdapter for data extraction | MUST | 1 |
| MSS-02 | Adapter registry supporting multiple registered adapters (SQL Server + PostgreSQL) | MUST | 1 |
| MSS-03 | Connection configuration UI for PostgreSQL (host, port, database, credentials) | MUST | 1 |
| MSS-04 | Origin tracking columns (origin_source, origin_sync_id, origin_synced_at) in all entity tables | MUST | 2 |
| MSS-05 | X-Origin-Source header extraction and storage in ingestion service | MUST | 2 |
| MSS-06 | Free-form upsert model: any origin can INSERT or UPDATE any entity | MUST | 2 |
| MSS-07 | Last-write-wins conflict resolution based on origin_synced_at | MUST | 2 |
| MSS-08 | Per-source sync state tracking (sourceId in sync_state) | MUST | 2 |
| MSS-09 | Per-source sync status display in dashboard | SHOULD | 5 |
| MSS-10 | Source conflict logging when two sources modify same record within overlap window | SHOULD | 2 |

### Dashboard Modernization (Priority 2)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| DM-01 | shadcn/ui initialization in gateway React dashboard | MUST | 5 |
| DM-02 | Staged migration: HTMX controls remain 100% functional during transition | MUST | 5 |
| DM-03 | Component replacement (not rewrite) using shadcn primitives | MUST | 5 |
| DM-04 | Origin information display (source, timestamp) for synced records | SHOULD | 5 |
| DM-05 | Metrics visualization (sync duration, record counts) | SHOULD | 5 |
| DM-06 | Dark mode toggle (shadcn built-in) | COULD | 5 |

### Auth Simplification (Priority 3)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| AS-01 | Token refresh endpoint (/auth/refresh) for long-running syncs | MUST | 3 |
| AS-02 | Auth diagnostics endpoint (/api/auth/diagnostics) for troubleshooting | MUST | 3 |
| AS-03 | Clear, specific error messages for auth failures (not generic errors) | MUST | 3 |
| AS-04 | First-time setup wizard (vs manual bcrypt hash generation) | SHOULD | 3 |
| AS-05 | Token status display in sync dashboard | SHOULD | 3 |
| AS-06 | Password change endpoint with proper security | SHOULD | 3 |
| AS-07 | Maintain existing security (bcrypt + JWT + HTTPS) | MUST | 3 |

### Observability (Priority 4)

| ID | Requirement | Priority | Phase |
|----|-------------|----------|-------|
| OB-01 | Structured logging with correlation IDs | MUST | 4 |
| OB-02 | Health check endpoint (/health) | MUST | 4 |
| OB-03 | Prometheus metrics export (/metrics) | SHOULD | 4 |
| OB-04 | Sync duration metrics per entity | SHOULD | 4 |
| OB-05 | Record count metrics per sync operation | SHOULD | 4 |
| OB-06 | Trace context propagation between sync and gateway | COULD | 4 |

## Success Criteria

### Milestone Complete When

1. **Multi-source works**: PostgreSQL queries execute through same pipeline as SQL Server
2. **Origin tracking visible**: Gateway stores and displays which source wrote each record
3. **Auth simplified**: Token refresh works, diagnostics endpoint available
4. **Observability active**: Health endpoint responds, metrics exposed
5. **Dashboard upgraded**: shadcn components integrated without breaking HTMX

### Acceptance Tests

| ID | Test | Validates |
|----|------|-----------|
| AT-01 | Create PostgreSQL connection, run query, verify data syncs to gateway | MSS-01, MSS-02, MSS-03 |
| AT-02 | Sync same entity from two sources, verify both records present with correct origin | MSS-04, MSS-05, MSS-06 |
| AT-03 | Update same record from two sources, verify last write wins | MSS-07 |
| AT-04 | Run long sync (>5min), verify token refresh maintains connection | AS-01 |
| AT-05 | Call /api/auth/diagnostics, verify useful troubleshooting info | AS-02 |
| AT-06 | Call /health, verify 200 response with status info | OB-02 |
| AT-07 | Call /metrics, verify Prometheus format output | OB-03 |
| AT-08 | Navigate gateway dashboard, verify shadcn components render | DM-01, DM-03 |

## Out of Scope

- Full HTMX to React migration (staged approach only)
- OpenTelemetry distributed tracing (defer to v2)
- Source priority override for conflict resolution (last-write-wins only)
- Cross-source validation for data quality
- Real-time automatic schema regeneration
- Third control module in monorepo

## Constraints

- Physical Deployment: Sync and gateway on separate servers
- Tech Stack: TypeScript, Fastify, Prisma, Zod, Drizzle — no framework changes
- Database: PostgreSQL authoritative, SQLite for sync state
- Backwards Compatibility: Existing sync configurations must continue working
- Security: All auth changes must maintain or improve current security posture

## Dependencies

```
Phase 1 (PostgreSQL Adapter) ─┐
                              ├──► Phase 2 (Origin Tracking) ──► Phase 5 (Dashboard)
Phase 3 (Auth) ───────────────┤                                        ▲
                              │                                        │
Phase 4 (Observability) ──────┴────────────────────────────────────────┘
```

- Phase 2 depends on Phase 1 (adapter must exist before origin tracking)
- Phase 5 depends on all others (visualizes features from Phases 2-4)
- Phases 3 and 4 are independent and can run in parallel

---
*Requirements defined: 2026-02-11*
