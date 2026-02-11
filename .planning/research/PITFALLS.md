# PITFALLS: v1.1-rc2 Multi-Source & Hardening

**Research Focus**: Common mistakes when adding multi-source sync, dashboard modernization, auth simplification, and observability to existing objetiva-sync system

**Project Context**: Adding PostgreSQL adapter, HTMX->shadcn migration, JWT simplification, structured logging/metrics

**Previous Version**: v1.0 research focused on schema-driven validation systems (still relevant, preserved below)

---

## v1.1-rc2 SPECIFIC PITFALLS

### Part A: Multi-Source Sync Pitfalls

---

#### MSS-01: Per-Query State Breaks with Multi-Origin Writes

**Risk:** Current `sync_state` table tracks `lastSyncValue` per query, assuming single origin. When PostgreSQL adapter writes to same entities, timestamps from two sources will collide.

**Warning signs:**
- Incremental sync misses records written by other sources
- `lastSyncValue` jumps backward when switching origins
- Records appear in full sync but not incremental

**Prevention:**
- Track `lastSyncValue` per source+entity combination, not per query
- Add `sourceId` column to `sync_state` table
- Store separate watermarks: `lastSyncValue_sqlserver`, `lastSyncValue_postgres`

**Phase:** Multi-source adapter implementation (Phase 1-2)

**Codebase reference:** Current implementation in `src/store/repositories/sync-state-repo.ts` assumes queryId uniqueness, but multi-source means same entity receives writes from different queries.

---

#### MSS-02: Last-Write-Wins Without Clock Sync Creates Silent Data Loss

**Risk:** "Free-form upsert, any origin can insert/update, last write wins" model assumes clocks are synchronized. ERP and PostgreSQL sources may have clock skew exceeding the existing 5-minute overlap protection.

**Warning signs:**
- Legitimate updates from slower source get overwritten
- `erp_fecha_sync` timestamps don't match actual write order
- User reports "my update disappeared"

**Prevention:**
- Use logical clocks (version counters) instead of/alongside timestamps
- Add `origin` column to gateway tables to track write source
- Log conflicts: record when two sources touch same record within overlap window
- Consider adding `version` or `revision` field to detect concurrent updates

**Phase:** Gateway ingestion service modification (Phase 1-2)

**External source:** [Multi-Master Conflicts](https://arpitbhayani.me/blogs/conflict-resolution/) - "This approach will not guarantee the actual ordering of writes, so it is possible that the actual Last Write got overwritten"

---

#### MSS-03: PostgreSQL Adapter Mismatch with SQL Server Adapter Interface

**Risk:** Current `IDataSourceAdapter` interface was designed for SQL Server extraction. PostgreSQL has different connection semantics, transaction models, and query patterns.

**Warning signs:**
- PostgreSQL adapter feels awkward to implement
- Connection pool exhaustion in PostgreSQL vs SQL Server
- Query parameter syntax differs (`@lastSync` vs `$1`)

**Prevention:**
- Review `IDataSourceAdapter` interface before implementing PostgreSQL adapter
- Use native parameter binding (pg library uses `$1`, `$2`)
- Consider connection pool settings per adapter type
- Test query parameter substitution thoroughly

**Phase:** PostgreSQL adapter implementation (Phase 1)

**Codebase reference:** `src/adapters/types.ts` defines interface; `src/adapters/sqlserver/sqlserver-adapter.ts` shows current implementation pattern.

---

#### MSS-04: Composite Key Lookup Fails Under Load

**Risk:** Current ingestion uses composite key lookups (`erp_codigo|erp_nombre`). With multiple sources upserting same entities, concurrent lookups may cause race conditions.

**Warning signs:**
- "Unique constraint failed" errors during high-volume syncs
- Duplicate records appearing in PostgreSQL
- Transaction failures under load

**Prevention:**
- Use database-level UPSERT (`ON CONFLICT DO UPDATE`) instead of lookup+insert/update
- Ensure composite key constraints are properly indexed
- Add advisory locks for high-contention entities

**Phase:** Gateway ingestion refactoring (Phase 2)

**Codebase reference:** `src/services/ingestion.ts` shows current batch lookup + createMany + transaction pattern.

---

#### MSS-05: Unclear Data Ownership Creates Debugging Nightmare

**Risk:** When any origin can upsert, debugging "where did this data come from?" becomes impossible without tracking.

**Warning signs:**
- Cannot reproduce data issues (which source caused it?)
- Support tickets require cross-referencing multiple logs
- Data quality issues with no clear owner

**Prevention:**
- Add `source_system` column to all synced tables
- Log source identifier with every batch ingestion
- Include source in structured logs: `{ source: 'sqlserver', entity: 'articulos', action: 'upsert' }`
- Create audit trail for debugging

**Phase:** Schema migration + ingestion logging (Phase 1-2)

**External source:** [Sync Challenges](https://www.leadsforge.ai/blog/top-challenges-in-data-sync-and-how-to-solve-them) - "Design Clear Data Ownership: Establish clear rules about which systems are authoritative for different types of data"

---

### Part B: Dashboard Migration Pitfalls

---

#### DM-01: Breaking Working HTMX Controls During Partial Migration

**Risk:** Staged migration means HTMX and React coexist. Changes to shared components (nav, layout) can break HTMX pages while building React equivalents.

**Warning signs:**
- Navigation breaks after React route added
- HTMX partials stop loading
- CSS conflicts between Tailwind (shadcn) and existing styles

**Prevention:**
- Keep HTMX views 100% functional until React replacement is complete AND tested
- Use separate route prefixes: `/dashboard/*` (HTMX), `/app/*` (React)
- Don't modify shared layouts until final migration phase
- Test HTMX pages after every React addition

**Phase:** Dashboard staging throughout (Phase 3-4)

**Codebase reference:** 19 EJS templates in `src/dashboard/views/` - each must continue working during migration.

---

#### DM-02: Shadcn Component Structure Churn

**Risk:** Shadcn recommends specific folder structure (`ui/`, `primitives/`, `blocks/`). Starting without this causes painful refactoring later.

**Warning signs:**
- Components scattered across files
- Can't upgrade shadcn components without breaking custom code
- Duplicate component implementations

**Prevention:**
- Establish structure from day one:
  - `ui/` - raw shadcn components (don't modify)
  - `primitives/` - lightly modified components
  - `blocks/` - product-level compositions
- Document which components are customized

**Phase:** React dashboard setup (Phase 3)

**External source:** [Shadcn Best Practices 2026](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44)

---

#### DM-03: State Management Mismatch with Existing SSE Patterns

**Risk:** Current dashboard uses SSE for real-time log streaming. React components need to integrate with existing SSE, not replace it.

**Warning signs:**
- Duplicate connections to log stream
- Memory leaks from unclean SSE teardown
- React state out of sync with SSE events

**Prevention:**
- Create single SSE connection manager used by all React components
- Use React hooks (`useEffect` cleanup) to properly disconnect
- Match existing log streaming endpoint, don't create new ones
- Test memory usage during long dashboard sessions

**Phase:** React dashboard + logs integration (Phase 3-4)

**Codebase reference:** `src/dashboard/routes/api/log-stream.ts` implements current SSE.

---

#### DM-04: Gateway React Dashboard is Separate from Sync Dashboard

**Risk:** There are TWO dashboards in this monorepo - gateway has React (`dashboard/`), sync has HTMX (`src/dashboard/views/`). Confusion about which is being modernized.

**Warning signs:**
- Building features in wrong dashboard
- Styles/components don't match
- Deployment only updates one dashboard

**Prevention:**
- Clarify scope: v1.1-rc2 modernizes sync dashboard (HTMX -> React)
- Gateway React dashboard (`objetiva-sync-gateway/dashboard/`) stays as-is
- Use same React stack (Vite, shadcn) for consistency across both
- Consider shared component library in `shared/` later

**Phase:** Planning clarification (Phase 0)

**Codebase reference:** `objetiva-sync-gateway/dashboard/` vs `objetiva-sync/src/dashboard/`

---

#### DM-05: Form State Loss During SSE-Heavy Operations

**Risk:** Current HTMX forms use server-side state. React forms use client state. Long-running sync operations may cause form state confusion.

**Warning signs:**
- Form data disappears during sync
- Double-submit bugs
- Optimistic UI doesn't match actual state

**Prevention:**
- Use form libraries (react-hook-form) for robust state
- Debounce form submissions during active syncs
- Show clear loading states that prevent interaction
- Persist critical form state to localStorage for recovery

**Phase:** React form implementation (Phase 3-4)

---

### Part C: Auth Simplification Pitfalls

---

#### AS-01: Removing Security While Simplifying Setup

**Risk:** "Simplified auth" may remove important security features. Current JWT with bcrypt password hashing is secure - don't weaken it.

**Warning signs:**
- Plain-text password storage proposed
- Removing JWT validation
- Hardcoded credentials in code

**Prevention:**
- Keep: bcrypt hashing, JWT tokens, HTTPS requirement
- Simplify: setup flow, token diagnostics, error messages
- Never: store plain passwords, skip token validation
- Add: better error messages, not less security

**Phase:** Auth simplification (Phase 4)

**Codebase reference:** `src/services/auth-service.ts` and `objetiva-sync-gateway/src/routes/auth.ts` - current implementation is secure.

---

#### AS-02: Token Rotation Without Refresh Tokens Creates Downtime

**Risk:** Adding token rotation is good, but with current short-lived JWT (24h default), rotation during long syncs may cause auth failures.

**Warning signs:**
- Sync fails partway through with 401
- Token expires during 100K+ record sync
- User re-authenticates but sync is lost

**Prevention:**
- Use refresh tokens for token renewal (opaque tokens, not JWT for refresh)
- Extend token lifetime for active operations
- Implement "Token is about to expire" warning
- Auto-refresh during long operations

**Phase:** Token rotation implementation (Phase 4-5)

**External source:** [Refresh Token Rotation](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/) - "Use single-use refresh tokens (valid for 7-14 days)"

---

#### AS-03: Dual Auth Systems (Sync Dashboard vs Gateway API)

**Risk:** Sync dashboard uses session auth (`auth-service.ts`), gateway API uses JWT (`routes/auth.ts`). Simplification may accidentally break one while fixing the other.

**Warning signs:**
- Dashboard login works but API calls fail
- Token works for sync but not schema fetch
- Different JWT secrets between systems

**Prevention:**
- Document both auth flows before modifying
- Test both flows after every auth change
- Ensure `JWT_SECRET` is shared correctly between systems
- Consider unifying to single auth mechanism long-term

**Phase:** Auth simplification (Phase 4)

**Codebase reference:** Two separate implementations - must maintain both.

---

#### AS-04: Setup Complexity From Hash Generation

**Risk:** Current setup requires pre-generating bcrypt hash for `SYNC_PASSWORD_HASH`. This is a UX friction point.

**Warning signs:**
- Users deploy without proper password setup
- Support tickets about "hash not configured" errors
- Users store plain password thinking it will be hashed

**Prevention:**
- Add `/api/setup/generate-hash` endpoint (one-time, with initial secret)
- CLI tool to generate hash: `npm run generate-hash`
- Better error message explaining hash requirement
- First-run wizard that handles hash generation

**Phase:** Auth simplification (Phase 4-5)

**Codebase reference:** `objetiva-sync-gateway/src/routes/setup.ts` - current setup flow.

---

#### AS-05: JWT Secret Mismatch Causes Silent Failures

**Risk:** Sync service generates JWTs, gateway validates them. If `JWT_SECRET` differs, auth silently fails with 401.

**Warning signs:**
- Sync connects but schema fetch fails with 401
- "Gateway authentication failed" errors
- Works locally, fails in deployment

**Prevention:**
- Add JWT secret validation on startup (sync checks it can decode gateway's test token)
- Diagnostic endpoint: `GET /api/auth/test-token` returns token validity
- Include JWT secret hash in status endpoint (for comparison, not the secret itself)
- Better error message: "JWT_SECRET mismatch between sync and gateway"

**Phase:** Auth diagnostics (Phase 4)

---

### Part D: Observability Pitfalls

---

#### OB-01: High-Cardinality Metrics Kill Performance

**Risk:** Adding metrics with user IDs, sync IDs, or request IDs as labels creates cardinality explosion.

**Warning signs:**
- Memory usage grows unboundedly
- Metrics storage fills up quickly
- Dashboard queries slow down

**Prevention:**
- Never use as metric labels: syncId, userId, requestId, entityId
- Use as log fields only (where they belong)
- Good labels: entityType (4 values), status (5 values), source (limited)
- Add cardinality limits: max 1000 events in memory

**Phase:** Metrics enhancement (Phase 5)

**External source:** [Observability Best Practices](https://spacelift.io/blog/observability-best-practices) - "High cardinality labels destroy Prometheus performance"

**Codebase reference:** `objetiva-sync-gateway/src/lib/metrics.ts` already has `maxEvents = 1000` - maintain this discipline.

---

#### OB-02: Logging Without Correlation IDs

**Risk:** Adding structured logging is good, but without correlation IDs, tracing requests across sync and gateway is impossible.

**Warning signs:**
- Cannot follow a single sync operation across logs
- Gateway log doesn't show which sync triggered it
- Debugging requires timestamp matching (error-prone)

**Prevention:**
- Generate `syncId` at sync start, propagate to all related logs
- Include `syncId` in gateway batch headers (already partially done)
- Add to all log calls: `{ syncId, entity, operation }`
- Ensure `syncId` appears in both sync and gateway logs

**Phase:** Structured logging (Phase 5)

**Codebase reference:** `syncId` exists in metadata but not consistently propagated.

---

#### OB-03: Duplicate Logging Between Services

**Risk:** Both sync and gateway log the same events (batch sent, batch received). Creates noisy, redundant logs.

**Warning signs:**
- Same event appears twice in log aggregator
- Confusion about which service logged what
- Storage costs double for same information

**Prevention:**
- Define clear log ownership:
  - Sync logs: query execution, batch preparation, retry decisions
  - Gateway logs: ingestion results, database operations
- Use different log prefixes: `[sync]`, `[gateway]`
- Avoid logging same information in both places

**Phase:** Log consolidation (Phase 5)

---

#### OB-04: Alerting on Everything Creates Alert Fatigue

**Risk:** Adding observability often means adding alerts for every metric. This leads to ignored alerts.

**Warning signs:**
- Team ignores alert channel
- Real issues get buried in noise
- "Alert fatigue" - assume alerts are false positives

**Prevention:**
- Start with ONLY critical alerts: sync failure, gateway down, auth failure
- Add alerts gradually as you understand normal patterns
- Use severity levels: CRITICAL (page), WARNING (Slack), INFO (log only)
- Maximum 5 initial alerts

**Phase:** Alerting setup (Phase 5)

**External source:** [Observability Best Practices](https://spacelift.io/blog/observability-best-practices) - "It's better to have five reliable alerts than fifty noisy ones"

---

#### OB-05: Metrics Without Dashboards Are Useless

**Risk:** Collecting metrics that no one looks at. Classic observability anti-pattern.

**Warning signs:**
- Metrics endpoint exists but no dashboard
- No one knows what the metrics mean
- "We have metrics" but can't answer basic questions

**Prevention:**
- Build dashboard FIRST, then add metrics it needs
- Start with key questions: "Is sync healthy?", "How many records synced today?"
- Gateway already has React dashboard - add metrics visualization there
- Create runbook linking alerts to dashboards

**Phase:** Dashboard metrics integration (Phase 5)

---

### Part E: Cross-Cutting Pitfalls

---

#### CC-01: Breaking Existing Tests During Feature Addition

**Risk:** 79 integration tests pass. New features may break them without triggering failures.

**Warning signs:**
- Tests pass but behavior changed
- Test coverage decreases
- Tests skip new code paths

**Prevention:**
- Run full test suite before every commit
- Maintain test coverage percentage
- Add tests for new features before implementing
- Don't skip or modify existing tests without review

**Phase:** All phases

**Codebase reference:** `tests/integration/` - 79 tests documented in v1.1-rc.

---

#### CC-02: Migration Runs on Production Before Testing

**Risk:** Multi-source requires schema changes (`source_system` column). Running migrations without testing breaks production.

**Warning signs:**
- "Column not found" errors after deploy
- Rollback required
- Data loss during migration

**Prevention:**
- Test all migrations on copy of production data
- Use reversible migrations
- Add columns as nullable first, then populate, then add constraints
- Deploy migration separately from code that uses it

**Phase:** Database migrations (Phase 1-2)

---

#### CC-03: Feature Flags Needed for Staged Rollout

**Risk:** All v1.1-rc2 features shipping simultaneously. If one breaks, all must be rolled back.

**Warning signs:**
- "All or nothing" deployment
- Cannot disable broken feature
- Users can't test new features gradually

**Prevention:**
- Add feature flags for major features:
  - `ENABLE_MULTI_SOURCE` - PostgreSQL adapter
  - `ENABLE_NEW_DASHBOARD` - React dashboard
  - `ENABLE_TOKEN_ROTATION` - new auth flow
- Ship flags disabled, enable gradually
- Quick disable without deploy

**Phase:** Configuration setup (Phase 0-1)

---

#### CC-04: Sync-Gateway Contract Changes Break Compatibility

**Risk:** Multi-source may require new headers/fields in sync-gateway communication. Old sync versions break with new gateway.

**Warning signs:**
- Old sync client fails against new gateway
- Missing header errors
- Schema validation failures

**Prevention:**
- Version the API: add `/api/v2/` for breaking changes
- Keep `/api/v1/` working during transition
- Add header: `X-Sync-Version: 2.0` for capability detection
- Document breaking changes

**Phase:** API versioning (Phase 1-2)

---

#### CC-05: Documentation Lags Behind Implementation

**Risk:** Rapid feature addition without documentation updates. Users and future maintainers suffer.

**Warning signs:**
- README doesn't match actual behavior
- Support questions about undocumented features
- Onboarding is difficult

**Prevention:**
- Update docs in same PR as code
- Add inline code comments for complex logic
- Maintain CHANGELOG.md
- Review docs as part of PR checklist

**Phase:** All phases (continuous)

---

## SUMMARY TABLE: v1.1-rc2 Pitfalls

| ID | Pitfall | Severity | Phase | Quick Prevention |
|----|---------|----------|-------|------------------|
| MSS-01 | Per-query state breaks | HIGH | 1-2 | Add sourceId to sync_state |
| MSS-02 | Clock skew data loss | HIGH | 1-2 | Use version counters |
| MSS-03 | Adapter interface mismatch | MEDIUM | 1 | Review interface first |
| MSS-04 | Composite key races | MEDIUM | 2 | Use UPSERT |
| MSS-05 | No data ownership | MEDIUM | 1-2 | Add source_system column |
| DM-01 | Breaking HTMX during migration | HIGH | 3-4 | Separate route prefixes |
| DM-02 | Shadcn structure churn | MEDIUM | 3 | Establish structure day 1 |
| DM-03 | SSE state mismatch | MEDIUM | 3-4 | Single SSE manager |
| DM-04 | Two dashboards confusion | LOW | 0 | Clarify scope |
| DM-05 | Form state loss | MEDIUM | 3-4 | Use form libraries |
| AS-01 | Removing security | CRITICAL | 4 | Keep bcrypt+JWT |
| AS-02 | Token rotation downtime | HIGH | 4-5 | Add refresh tokens |
| AS-03 | Dual auth systems | MEDIUM | 4 | Document both flows |
| AS-04 | Hash generation friction | MEDIUM | 4-5 | Add CLI tool |
| AS-05 | JWT secret mismatch | HIGH | 4 | Add diagnostics |
| OB-01 | High cardinality metrics | HIGH | 5 | No IDs as labels |
| OB-02 | No correlation IDs | MEDIUM | 5 | Propagate syncId |
| OB-03 | Duplicate logging | LOW | 5 | Define ownership |
| OB-04 | Alert fatigue | MEDIUM | 5 | Start with 5 alerts |
| OB-05 | Metrics without dashboards | MEDIUM | 5 | Dashboard first |
| CC-01 | Breaking tests | HIGH | All | Run tests always |
| CC-02 | Untested migrations | HIGH | 1-2 | Test on prod copy |
| CC-03 | No feature flags | MEDIUM | 0-1 | Add flags |
| CC-04 | Contract breaks | HIGH | 1-2 | Version API |
| CC-05 | Doc lag | MEDIUM | All | Docs with code |

---

## SOURCES

- [Multi-Master Conflicts](https://arpitbhayani.me/blogs/conflict-resolution/)
- [Data Sync Challenges](https://www.leadsforge.ai/blog/top-challenges-in-data-sync-and-how-to-solve-them)
- [Shadcn UI Best Practices 2026](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44)
- [Refresh Token Rotation](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
- [JWT Best Practices](https://curity.io/resources/learn/jwt-best-practices/)
- [Observability Best Practices 2026](https://spacelift.io/blog/observability-best-practices)
- [Structured Logging](https://www.grepr.ai/blog/structured-logging---what-it-is-and-why-you-need-it)
- Codebase analysis: objetiva-sync-monorepo source code

---

## PRESERVED: v1.0 Schema-Driven Validation Pitfalls

*The following pitfalls from v1.0 research remain relevant:*

### 1. CODEGEN PITFALLS

- **1.1 Stale Generated Code After Schema Changes** - Never commit generated code; use staleness detection
- **1.2 Type Mismatches Between Layers** - Single source of truth from PostgreSQL introspection
- **1.3 Ignoring Database Constraints During Generation** - Capture all constraint types

### 2. INTROSPECTION RELIABILITY

- **2.1 Connection Failures in Distributed Systems** - Never introspect in production builds
- **2.2 Permission and Access Issues** - Dedicated introspection user with proper grants
- **2.3 Schema Introspection Race Conditions** - Lock schema during introspection

### 3. QUERY VALIDATION EDGE CASES

- **3.1 Dynamic SQL Not Analyzable at Save Time** - Classify static vs dynamic queries
- **3.2 Parameterized Query Type Mismatches** - Cross-reference placeholder types with schemas
- **3.3 Schema Version Skew in Distributed System** - Version schema snapshots

### 4. SCHEMA CACHING STRATEGIES

- **4.1 Naive Cache Invalidation** - Event-driven cache invalidation
- **4.2 Cold Cache Performance Impact** - Pre-warm cache during startup
- **4.3 Memory Bloat from Cached Schemas** - Cache only necessary subset

### 5. DISTRIBUTED SYSTEM SPECIFIC

- **5.1 Network Partition Handling** - Circuit breaker pattern with fallback
- **5.2 Schema Migration Coordination** - Expand-contract pattern for breaking changes

### 6. TESTING AND OBSERVABILITY

- **6.1 Inadequate Introspection Testing** - Test with edge cases and various permissions
- **6.2 Missing Observability for Schema Operations** - Structured logging for all schema ops

---

**Document Version**: 2.0 (v1.1-rc2)
**Last Updated**: 2026-02-11
**Research Type**: Project Research - Pitfalls Dimension (v1.1-rc2 features)
