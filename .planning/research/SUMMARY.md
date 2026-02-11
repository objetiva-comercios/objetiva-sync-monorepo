# Project Research Summary

**Project:** objetiva-sync-monorepo v1.1-rc2
**Domain:** Multi-source data synchronization with dashboard modernization
**Researched:** 2026-02-11
**Confidence:** HIGH

## Executive Summary

The v1.1-rc2 milestone adds multi-origin sync capability (PostgreSQL as data source), modernizes the gateway dashboard with shadcn/ui, simplifies authentication workflows, and introduces structured observability. Research confirms the existing architecture was designed for extensibility: all new features map to existing extension points. The PostgreSQL adapter slots cleanly into the established adapter pattern alongside SQLServerAdapter, using the mature pg library already present in the gateway dependencies.

The recommended approach is to implement features in dependency order: multi-source first (enabling the core capability), then origin tracking in the gateway (for audit trail), followed by auth improvements (reducing setup friction), observability (production readiness), and finally dashboard modernization (lowest priority but highest polish). The free-form upsert model (any origin can INSERT/UPDATE, last write wins) is viable but requires origin tracking columns (origin_source, origin_synced_at) to maintain data provenance.

Key risks center on multi-source sync: clock skew between sources can cause silent data loss, and per-query sync state tracking must be extended to handle multiple origins. Critical mitigation: add sourceId to sync_state table and track separate watermarks per source. Authentication changes must preserve existing security (bcrypt + JWT) while simplifying setup UX. Dashboard migration requires strict isolation to avoid breaking working HTMX controls.

## Key Findings

### Recommended Stack

No major new dependencies required. The PostgreSQL adapter uses pg (already in gateway), shadcn/ui integrates with existing React/Tailwind in gateway dashboard, and observability leverages @fastify/otel (official Fastify instrumentation replacing deprecated @opentelemetry/instrumentation-fastify).

**Core additions:**

- **pg ^8.18.0**: PostgreSQL adapter for sync module - same library gateway already uses, follows existing adapter pattern
- **@fastify/otel + @opentelemetry/sdk-node**: Observability stack - official Fastify instrumentation, OTLP export for backend flexibility
- **radix-ui ^1.4.3**: Unified Radix primitives for shadcn/ui - new unified package (Feb 2026), cleaner than individual @radix-ui/* packages
- **pino-opentelemetry-transport**: Log correlation with traces - integrates with existing Pino logging

**Explicitly NOT recommended:**

- postgres.js (different API, AWS issues, smaller ecosystem)
- @opentelemetry/instrumentation-fastify (deprecated, EOL June 2025)
- better-auth/passport (overkill for existing JWT setup)

### Expected Features

**Must have (table stakes):**

- PostgreSQL Adapter implementing IDataSourceAdapter for extraction queries
- Adapter Registry extension for multiple registered adapters
- Connection Configuration UI for PostgreSQL (host, port, database, credentials)
- Last-Write-Wins conflict resolution with origin tracking
- First-Time Setup Wizard for auth (vs manual bcrypt hash generation)
- Clear error messages for auth failures
- Structured logging with correlation IDs
- Health check endpoint (/health)

**Should have (differentiators):**

- Source tracking (origin_source column) for audit trail
- Per-source sync status tracking
- Token refresh mechanism (avoid re-login during long syncs)
- Auth diagnostics endpoint for troubleshooting
- Prometheus metrics export (/metrics)
- Dark mode toggle (shadcn built-in)

**Defer (v2+):**

- Full HTMX to React dashboard migration (staged approach preferred)
- OpenTelemetry distributed tracing (high complexity)
- Source priority override for conflict resolution
- Cross-source validation for data quality

### Architecture Approach

The existing adapter pattern provides clean extension point for PostgreSQL. Multi-source upsert requires gateway-side changes (origin columns in Prisma schema, header extraction in routes, ingestion service modifications). Auth simplification adds endpoints without changing existing flow. Observability is additive layer. Dashboard modernization targets gateway React dashboard only; sync HTMX dashboard remains unchanged.

**Major components (changes):**

1. **PostgreSQLAdapter** (NEW) - extends AbstractAdapter, implements same interface as SQLServerAdapter
2. **IngestionService** (MODIFY) - accept and store origin_source, origin_sync_id, origin_synced_at
3. **Auth routes** (EXTEND) - add /auth/refresh, /api/auth/diagnostics, /setup/change-password
4. **Observability layer** (NEW) - prometheus-exporter.ts, trace-context.ts middleware
5. **Gateway Dashboard** (ENHANCE) - add shadcn/ui components, display origin information

**Data flow addition:**

```
Sync Module                    Gateway
-----------                    -------
PostgreSQLAdapter.executeQuery()
    |
    v
BatchProcessor (adds X-Origin-Source header)
    |
    v                          Route extracts origin header
                                   |
                                   v
                               IngestionService stores origin_source, origin_synced_at
```

### Critical Pitfalls

Top 5 pitfalls requiring attention:

1. **MSS-01: Per-query state breaks with multi-origin** - Current sync_state tracks lastSyncValue per query, not per source. Prevention: Add sourceId column, track separate watermarks per source+entity.

2. **MSS-02: Clock skew causes silent data loss** - Last-write-wins assumes synchronized clocks. Prevention: Add version counters, log conflicts when two sources touch same record within overlap window.

3. **AS-01: Removing security while simplifying setup** (CRITICAL) - Must maintain bcrypt hashing, JWT validation, HTTPS. Simplify UX only: setup wizard, error messages, diagnostics.

4. **DM-01: Breaking HTMX during partial migration** - Staged migration means HTMX and React coexist. Prevention: Keep HTMX 100% functional until React replacement tested, use separate route prefixes.

5. **CC-04: Contract breaks between sync and gateway** - New headers/fields may break older clients. Prevention: Version API (/api/v2/), add X-Sync-Version header for capability detection.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: PostgreSQL Adapter
**Rationale:** Core feature with zero dependencies. Clean extension of existing adapter pattern.
**Delivers:** Ability to extract data from PostgreSQL sources using same query-based sync mechanism.
**Addresses:** PostgreSQL Adapter, Adapter Registry, Connection Config UI (table stakes)
**Avoids:** MSS-03 (interface mismatch) - review IDataSourceAdapter interface before implementing
**Complexity:** MEDIUM | **Risk:** LOW

**Key files:**
- objetiva-sync/src/adapters/postgres/postgres-adapter.ts (NEW)
- objetiva-sync/src/adapters/index.ts (MODIFY - add registry)
- objetiva-sync/src/dashboard/views/config/connection.ejs (MODIFY)

### Phase 2: Multi-Source Origin Tracking
**Rationale:** Enables free-form upsert model. Database changes should precede code using them.
**Delivers:** Audit trail showing which source wrote each record, when.
**Uses:** Prisma migrations, existing ingestion service
**Implements:** Origin tracking columns, header extraction, ingestion modification
**Avoids:** MSS-05 (no data ownership), MSS-02 (clock skew) via origin_synced_at timestamps
**Complexity:** MEDIUM | **Risk:** LOW

**Key files:**
- objetiva-sync-gateway/prisma/schema.prisma (MODIFY - add origin columns)
- objetiva-sync-gateway/src/services/ingestion.ts (MODIFY)
- objetiva-sync-gateway/src/routes/articulos.ts, comprobantes.ts (MODIFY)

### Phase 3: Auth Simplification
**Rationale:** Reduces setup friction without touching core sync flow. Independent of Phases 1-2.
**Delivers:** Token refresh, diagnostics endpoint, better error messages, setup wizard.
**Uses:** Existing @fastify/jwt, bcrypt (no new libraries)
**Implements:** New auth endpoints, AuthManager refresh support
**Avoids:** AS-01 (security removal), AS-02 (token rotation downtime), AS-05 (JWT secret mismatch)
**Complexity:** MEDIUM | **Risk:** LOW

**Key files:**
- objetiva-sync-gateway/src/routes/auth.ts (MODIFY)
- objetiva-sync-gateway/src/lib/token-manager.ts (NEW)
- objetiva-sync/src/api-client/auth.ts (MODIFY)

### Phase 4: Observability
**Rationale:** Production readiness before dashboard polish. Metrics inform dashboard design.
**Delivers:** Prometheus metrics, trace context, correlation IDs, health endpoint.
**Uses:** @fastify/otel, @opentelemetry/sdk-node, pino-opentelemetry-transport
**Implements:** Observability layer in both services
**Avoids:** OB-01 (high cardinality), OB-02 (no correlation IDs)
**Complexity:** MEDIUM | **Risk:** LOW

**Key files:**
- objetiva-sync-gateway/src/lib/observability/prometheus-exporter.ts (NEW)
- objetiva-sync-gateway/src/lib/observability/trace-context.ts (NEW)
- objetiva-sync-gateway/src/routes/metrics.ts (NEW)

### Phase 5: Dashboard Modernization
**Rationale:** Lowest priority, highest risk. Requires all other features for full integration.
**Delivers:** shadcn/ui components in gateway React dashboard, origin display, metrics visualization.
**Uses:** radix-ui, existing React/Tailwind stack
**Implements:** Component replacement (not rewrite), origin and metrics display
**Avoids:** DM-01 (breaking HTMX), DM-02 (structure churn)
**Complexity:** MEDIUM | **Risk:** MEDIUM

**Key files:**
- objetiva-sync-gateway/dashboard/components.json (NEW)
- objetiva-sync-gateway/dashboard/src/components/ui/*.tsx (NEW - shadcn)
- objetiva-sync-gateway/dashboard/src/components/*.tsx (MODIFY)

### Phase Ordering Rationale

- **Phases 1-2 first:** Multi-source is the primary milestone goal. Database changes (Phase 2) must precede code that uses them but can run in parallel with adapter work (Phase 1).
- **Phase 3 independent:** Auth simplification has no dependencies on Phases 1-2. Could theoretically run in parallel.
- **Phase 4 before Phase 5:** Observability informs dashboard metrics display. Build metrics first, then visualize.
- **Phase 5 last:** Dashboard modernization is polish. All other features should work before adding UI improvements. Lower risk if cut from milestone.

### Cross-Cutting Concerns (All Phases)

- **CC-01:** Run full test suite before every commit (79 integration tests)
- **CC-03:** Implement feature flags (ENABLE_MULTI_SOURCE, ENABLE_TOKEN_ROTATION)
- **CC-05:** Update docs in same PR as code

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2:** Origin tracking timestamp format and conflict detection threshold need design decision
- **Phase 4:** OpenTelemetry SDK versions change rapidly - verify latest before implementing

**Phases with standard patterns (skip research-phase):**

- **Phase 1:** PostgreSQL adapter - well-documented pg library, mirrors existing SQLServerAdapter
- **Phase 3:** Auth simplification - standard JWT refresh pattern, existing @fastify/jwt
- **Phase 5:** Dashboard - official shadcn/ui CLI handles setup

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Libraries already in use or official recommendations; pg verified, @fastify/otel confirmed |
| Features | MEDIUM | Feature priorities inferred from PROJECT.md and user context; may need validation |
| Architecture | HIGH | Based on comprehensive codebase analysis; extension points verified |
| Pitfalls | HIGH | 25 pitfalls identified with specific prevention strategies; cross-referenced with codebase |

**Overall confidence:** HIGH

### Gaps to Address

- **Conflict detection threshold:** When two sources write same record within X minutes, should we log a warning? What is X? (Decide during Phase 2 planning)
- **Sync state migration:** Adding sourceId to sync_state requires migration for existing data. Null handling strategy needed.
- **Dashboard scope confirmation:** Research assumes gateway React dashboard modernization. Verify sync HTMX dashboard stays unchanged.
- **OpenTelemetry version pinning:** SDK versions evolve rapidly. Pin versions when implementing Phase 4.

## Sources

### Primary (HIGH confidence)

- **node-postgres documentation** (https://node-postgres.com/) - PostgreSQL adapter patterns, connection pooling
- **@fastify/otel GitHub** (https://github.com/fastify/otel) - Official Fastify instrumentation, replaces deprecated package
- **shadcn/ui Installation** (https://ui.shadcn.com/docs/installation) - Component setup, unified radix-ui package
- **Codebase analysis** - Comprehensive review of objetiva-sync-monorepo patterns

### Secondary (MEDIUM confidence)

- **Multi-Master Conflicts** (https://arpitbhayani.me/blogs/conflict-resolution/) - Last-write-wins limitations
- **Data Sync Challenges** (https://www.leadsforge.ai/blog/top-challenges-in-data-sync-and-how-to-solve-them) - Data ownership patterns
- **Shadcn UI Best Practices 2026** (https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44) - Component structure
- **Observability Best Practices** (https://spacelift.io/blog/observability-best-practices) - Cardinality, alerting

### Tertiary (LOW confidence)

- **Refresh Token Rotation** (https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/) - Token lifetime recommendations
- **OpenTelemetry Metrics Guide** (https://www.groundcover.com/opentelemetry/opentelemetry-metrics) - Metric types

---
*Research completed: 2026-02-11*
*Ready for roadmap: yes*
