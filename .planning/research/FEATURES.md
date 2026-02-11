# Features Research: v1.1-rc2

**Domain:** Multi-source data synchronization with dashboard modernization
**Researched:** 2026-02-11
**Overall Confidence:** MEDIUM

---

## Multi-Source Sync

Adding PostgreSQL as an additional data origin alongside SQL Server, enabling free-form upsert where any source can write any entity.

### Table Stakes

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **PostgreSQL Adapter** | Implement `IDataSourceAdapter` for PostgreSQL using `pg` library following existing SQLServerAdapter pattern | Medium | Existing adapter pattern in `src/adapters/` |
| **Adapter Registry** | Extend adapter selection to support multiple registered adapters (sqlserver, postgres) | Low | Existing `IAdapterRegistry` interface |
| **Connection Configuration UI** | Dashboard UI to configure PostgreSQL connections (host, port, database, credentials) | Medium | Existing connection.ejs pattern |
| **Connection Testing** | Test connection button for PostgreSQL with meaningful error messages | Low | Existing `testConnection()` pattern |
| **Entity Resolution** | Consistent entity identification across sources using `erp_codigo` as the natural key | Medium | Existing sync-engine.ts |
| **Last-Write-Wins Conflict Resolution** | When same entity arrives from multiple sources, most recent timestamp wins | Low | Timestamps already tracked in PostgreSQL gateway |

### Differentiators

| Feature | Description | Value Proposition | Complexity |
|---------|-------------|-------------------|------------|
| **Source Tracking** | Store `source_adapter_type` with each synced record for audit trail | Debug/audit capability | Low |
| **Per-Source Sync Status** | Track last sync time and status independently per source | Granular monitoring | Medium |
| **Source Priority Override** | Optional: Allow certain sources to take precedence for specific entities | Advanced conflict control | High |
| **Cross-Source Validation** | Detect when same entity exists in multiple sources with different values | Data quality insight | Medium |

### Anti-Features

| Anti-Feature | Why NOT to Build |
|--------------|------------------|
| **Bidirectional sync back to sources** | Project scope is pull-only ETL; writing back introduces complexity, locking, transaction issues |
| **Custom conflict resolution rules per field** | Over-engineering for the use case; last-write-wins is sufficient |
| **Real-time CDC from PostgreSQL** | Polling-based sync is established pattern; CDC adds infrastructure complexity |
| **Automatic schema inference** | Query-based sync with explicit SQL already works; inference is error-prone |

---

## Dashboard Modernization

Migrating HTMX + EJS dashboard (objetiva-sync) to shadcn/ui staged, while preserving working controls.

### Table Stakes

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **shadcn/ui Component Setup** | Initialize shadcn/ui in objetiva-sync dashboard with Tailwind, cn() utility | Low | Existing Tailwind setup |
| **Staged Migration Strategy** | Migrate page-by-page rather than all-at-once to minimize risk | Low | None (process, not code) |
| **Preserve Existing Routes** | Keep all existing `/config/*`, `/sync/*`, `/scheduler/*` routes working | Low | Existing route handlers |
| **Component Parity** | Migrate each EJS view to React with equivalent functionality | High | Multiple views (~15 EJS files) |
| **HTMX Partial Replacement** | Replace `hx-get`/`hx-post` with React Query or SWR for data fetching | Medium | Current HTMX patterns |
| **Form Handling Migration** | Replace HTMX form submissions with React Hook Form or similar | Medium | Existing form patterns |

### Differentiators

| Feature | Description | Value Proposition | Complexity |
|---------|-------------|-------------------|------------|
| **Unified Design System** | Single component library (shadcn/ui) across both dashboards | Consistency, maintainability | Medium |
| **Dark Mode Toggle** | shadcn/ui comes with dark mode support built-in | Modern UX | Low |
| **Responsive Layout Improvements** | Current EJS views are functional but not optimized; React components can be more polished | Better mobile experience | Medium |
| **Component Reuse** | Share components between objetiva-sync and gateway dashboards | DRY, faster development | Medium |
| **Loading State Skeletons** | Replace "Cargando..." text with proper skeleton loaders | Perceived performance | Low |

### Anti-Features

| Anti-Feature | Why NOT to Build |
|--------------|------------------|
| **Full SPA with client-side routing** | Overkill for admin dashboard; server-rendered with React islands is sufficient |
| **State Management Library (Redux, Zustand)** | Dashboard is mostly CRUD forms; local state + React Query is enough |
| **Mobile App** | Dashboard is admin-only; web-responsive is sufficient |
| **Complete Rewrite in One Phase** | High risk; staged migration preserves working functionality |
| **Base UI Migration (instead of Radix)** | shadcn/ui just added Base UI support in Feb 2026, but Radix is more stable and documented |

---

## Auth Simplification

Reducing initial setup complexity, token rotation pain, and debugging issues.

### Table Stakes

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **First-Time Setup Wizard** | Guided flow for initial admin setup instead of env vars + manual steps | Medium | Existing auth-service.ts |
| **Clear Error Messages** | When JWT fails, show exactly what went wrong (expired, wrong secret, invalid signature) | Low | Existing JWT validation |
| **Token Status Dashboard** | Show current token expiry, last refresh, upcoming expiration warning | Low | Current JWT handling |
| **Automatic Token Refresh** | Background refresh before expiry to prevent mid-sync failures | Medium | Existing gateway-client.ts |
| **Connection Test with Auth** | Single "Test Full Connection" button that validates auth + connectivity | Low | Existing test patterns |

### Differentiators

| Feature | Description | Value Proposition | Complexity |
|---------|-------------|-------------------|------------|
| **One-Click Auth Setup** | Generate shared secret between modules, auto-configure both sides | Major DX improvement | Medium |
| **Auth Troubleshooting Page** | Dedicated page showing: token validity, gateway reachability, last successful auth | Debug productivity | Medium |
| **JWT Debugging Mode** | Optional verbose logging for auth flow during setup | Setup assistance | Low |
| **Session Persistence Across Restarts** | Store session state so service restart doesn't require re-login | Convenience | Low |

### Anti-Features

| Anti-Feature | Why NOT to Build |
|--------------|------------------|
| **OAuth2/OIDC Integration** | Over-engineering for single-tenant admin dashboard; simple JWT is sufficient |
| **Multi-User Access Control** | Current single admin user is sufficient for the use case |
| **SSO/LDAP Integration** | Enterprise feature not needed for this deployment model |
| **Passwordless/Magic Link Auth** | Adds complexity; password-based is fine for admin dashboard |
| **API Key Management UI** | JWT between modules is already working; API keys add another auth mechanism |

---

## Observability

Adding metrics, logging, and monitoring capabilities for production reliability.

### Table Stakes

| Feature | Description | Complexity | Dependencies |
|---------|-------------|------------|--------------|
| **Structured Logging** | JSON logs with correlation IDs across sync operations | Low | Existing pino logger |
| **Sync Duration Metrics** | Track time per sync operation, per entity type, per batch | Low | Existing timing in sync-engine.ts |
| **Error Rate Tracking** | Count and categorize errors (network, validation, timeout) | Low | Existing error handling |
| **Health Check Endpoint** | `/health` endpoint returning service status, dependencies, metrics summary | Low | Standard pattern |
| **Sync Progress Events** | Emit progress updates during long-running syncs for UI feedback | Medium | Existing `onProgress` callback |

### Differentiators

| Feature | Description | Value Proposition | Complexity |
|---------|-------------|-------------------|------------|
| **Prometheus Metrics Export** | `/metrics` endpoint in Prometheus format for external monitoring | Industry standard observability | Medium |
| **OpenTelemetry Traces** | Distributed tracing across objetiva-sync -> gateway | Debug cross-service issues | High |
| **RED Metrics Dashboard** | Rate, Errors, Duration metrics visualized in gateway dashboard | SRE best practice | Medium |
| **Log Correlation** | TraceId/SpanId in logs for correlating across components | Debug productivity | Medium |
| **Grafana Dashboard Templates** | Pre-built Grafana dashboards for sync monitoring | Fast observability setup | Low |

### Anti-Features

| Anti-Feature | Why NOT to Build |
|--------------|------------------|
| **Full APM Integration (Datadog, New Relic)** | Vendor lock-in; Prometheus + Grafana is sufficient and free |
| **Custom Metrics Database** | Use existing PostgreSQL or external Prometheus; don't reinvent |
| **Real-Time Alerting System** | External tool (Grafana Alerting, PagerDuty) handles this better |
| **Log Aggregation Service** | Loki or external service; don't build log storage |
| **Distributed Tracing Infrastructure** | Just export OTLP; let external systems (Jaeger, Tempo) handle storage |

---

## Feature Dependencies

```
Multi-Source Sync
    |
    +-- PostgreSQL Adapter (requires adapter pattern understanding)
    |
    +-- Connection Configuration UI (requires dashboard)
    |
    +-- Source Tracking (optional, enhances debugging)

Dashboard Modernization
    |
    +-- shadcn/ui Setup (foundational)
    |
    +-- Component Migration (page-by-page)
    |       |
    |       +-- Login/Auth pages
    |       +-- Configuration pages
    |       +-- Sync pages
    |       +-- Scheduler pages
    |
    +-- HTMX Replacement (per-page)

Auth Simplification
    |
    +-- Error Message Improvements (low risk, do first)
    |
    +-- Token Status Dashboard (requires dashboard migration?)
    |
    +-- Setup Wizard (depends on improved error messages)

Observability
    |
    +-- Structured Logging (foundational, do first)
    |
    +-- Health Endpoint (standalone)
    |
    +-- Metrics Export (depends on structured logging)
    |
    +-- Tracing (optional, highest complexity)
```

---

## MVP Recommendation

For v1.1-rc2 milestone, prioritize:

1. **Multi-Source: PostgreSQL Adapter + Config UI** - Core feature request
2. **Auth: Error Messages + Token Status** - Quick wins for setup pain
3. **Observability: Structured Logging + Health Endpoint** - Production readiness
4. **Dashboard: shadcn/ui Setup + 1-2 Page Migrations** - Prove the pattern

Defer to future milestones:

- **Dashboard: Full Migration** - Too risky in one milestone
- **Observability: OpenTelemetry Tracing** - High complexity, not blocking
- **Multi-Source: Source Priority Override** - Over-engineering for initial release
- **Auth: One-Click Setup** - Nice-to-have, not critical

---

## Sources

### Multi-Source Sync
- [10 Common Data Integration Patterns: A Complete Guide for 2026](https://blog.skyvia.com/common-data-integration-patterns/)
- [Two-Way Sync Architecture: Essential Knowledge for Data Professionals](https://www.stacksync.com/blog/two-way-sync-architecture-essential-knowledge-for-data-professionals)
- [node-postgres documentation](https://node-postgres.com/)
- [pg library on npm](https://www.npmjs.com/package/pg)

### Dashboard Modernization
- [shadcn/ui Changelog - February 2026](https://ui.shadcn.com/docs/changelog/2026-02-blocks)
- [Shadcn UI Best Practices for 2026](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44)
- [HTMX vs React: A First Look and Comparison](https://www.builder.io/blog/htmx-vs-react)
- [Integrating HTMX with React and Next.js](https://www.syncfusion.com/blogs/post/htmx-with-react-nextjs-server-driven-ui)

### Auth Simplification
- [JWT Validation: A Developer's Pain Point and the Solution](https://medium.com/@davidlogicballs/jwt-validation-a-developers-pain-point-and-the-solution-ca9f0da40008)
- [How to Build Authentication Flow Design](https://oneuptime.com/blog/post/2026-01-30-authentication-flow-design/view)

### Observability
- [Essential OpenTelemetry Best Practices for Robust Observability](https://betterstack.com/community/guides/observability/opentelemetry-best-practices/)
- [Go Observability Stack: Prometheus, Grafana, and OpenTelemetry](https://dasroot.net/posts/2026/02/go-observability-stack-prometheus-grafana-opentelemetry/)
- [OpenTelemetry Metrics: Types, Examples & Best Practices](https://www.groundcover.com/opentelemetry/opentelemetry-metrics)

---

## Quality Gate Checklist

- [x] Categories are clear (table stakes vs differentiators vs anti-features)
- [x] Complexity noted for each feature
- [x] Dependencies on existing features identified

---
*Researched: 2026-02-11*
