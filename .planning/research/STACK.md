# Stack Research: v1.1-rc2 Multi-Source & Hardening

**Project:** objetiva-sync-monorepo
**Researched:** 2026-02-11
**Focus:** Multi-source sync, dashboard modernization, auth simplification, observability

---

## Executive Summary

This research covers stack additions for v1.1-rc2 features. The existing codebase has solid foundations (Fastify 5/4, Prisma, Drizzle, Zod, HTMX+EJS, React). New capabilities require targeted additions rather than replacements.

**Key findings:**
- PostgreSQL source adapter: Use existing `pg` v8.17.2 already in gateway — minimal new dependency
- Dashboard modernization: shadcn/ui requires Radix UI primitives (gateway dashboard already has Tailwind)
- Observability: `@fastify/otel` is the future-proof choice (official Fastify instrumentation)
- Auth simplification: Existing `@fastify/jwt` is sufficient, add diagnostics middleware

---

## Recommended Additions

### 1. PostgreSQL Source Adapter

**Context:** Need to extract data FROM PostgreSQL (as source), not just write TO it (Prisma handles destination).

**Recommendation: Use `pg` v8.18.0**

The gateway already has `pg` installed for Prisma's underlying PostgreSQL connection. For the sync module's adapter pattern, use the same library.

| Library | Version | Purpose | Integration |
|---------|---------|---------|-------------|
| `pg` | ^8.18.0 | PostgreSQL client for source adapter | Sync module adapter pattern |
| `@types/pg` | ^8.16.0 | TypeScript types | Already in gateway devDeps |

**Rationale:**
- `pg` is mature with 12,605+ dependent packages
- Compatible with Node.js 18.x, 20.x, 22.x, 24.x
- Gateway already uses it (no new dependency tree)
- Follows same pattern as existing SQL Server adapter (mssql)
- Type parsers supported per-query (important for ERP data variance)

**NOT recommended: postgres.js (Postgres.js)**
- Different API from `pg` — would require learning new patterns
- Prepared statements by default can cause issues in AWS environments
- Smaller ecosystem (643 dependent projects vs 12,605)
- No advantage for simple query-based sync extraction

**Installation (objetiva-sync only):**
```bash
npm install pg@^8.18.0
npm install -D @types/pg@^8.16.0
```

**Implementation notes:**
- Create `PostgreSQLAdapter` extending `AbstractAdapter`
- Use connection pooling like SQL Server adapter
- Query INFORMATION_SCHEMA for getTables/getColumns methods

---

### 2. Dashboard Modernization (shadcn/ui)

**Context:** Migrate gateway React dashboard to shadcn/ui components. Sync module HTMX+EJS dashboard remains unchanged (different use case).

**Existing foundation (gateway dashboard):**
- React 18.3.1
- Tailwind CSS 3.4.1
- Vite 5.1.0
- lucide-react 0.263.1
- clsx, tailwind-merge, class-variance-authority (already installed)

**Recommended additions:**

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `radix-ui` | ^1.4.3 | Unified Radix primitives | New unified package (Feb 2026) |
| `@radix-ui/react-slot` | ^1.1.0 | Slot composition | Required by shadcn Button |

**NOT individual @radix-ui/react-* packages** — shadcn/ui now recommends unified `radix-ui` package (cleaner package.json).

**Installation:**
```bash
cd objetiva-sync-gateway/dashboard
npx shadcn@latest init
```

The CLI will:
1. Create `components.json` configuration
2. Set up `@/components/ui` directory structure
3. Configure Tailwind for shadcn

**Adding components:**
```bash
npx shadcn@latest add button card table dialog alert toast
```

**Key components for dashboard:**
- `table` — Data grids for entities
- `card` — Metric cards, activity feed
- `dialog` — Confirmations, forms
- `alert` — Error/success messages
- `badge` — Status indicators
- `tabs` — Navigation
- `toast` — Notifications

**Migration strategy:**
1. Initialize shadcn in gateway dashboard
2. Add components incrementally (one at a time)
3. Replace custom components with shadcn equivalents
4. Leave HTMX+EJS dashboard in sync module untouched

---

### 3. Observability Stack

**Context:** Add structured observability (traces, metrics) to both Fastify services.

**CRITICAL:** `@opentelemetry/instrumentation-fastify` is deprecated (EOL: June 30, 2025). Use official `@fastify/otel` instead.

**Recommended stack:**

| Library | Version | Purpose | Module |
|---------|---------|---------|--------|
| `@fastify/otel` | ^0.1.x | Fastify instrumentation | Both |
| `@opentelemetry/sdk-node` | ^0.211.0 | OTel SDK bootstrap | Both |
| `@opentelemetry/api` | ^1.9.0 | Tracing/metrics API | Both |
| `@opentelemetry/instrumentation-http` | ^0.57.0 | HTTP instrumentation | Both |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.57.0 | OTLP trace export | Both |
| `pino-opentelemetry-transport` | ^0.4.0 | Pino logs to OTel | Both |

**Rationale:**
- `@fastify/otel` is the official Fastify team's instrumentation (future-proof)
- Integrates with existing Pino logging via `pino-opentelemetry-transport`
- OTLP export allows backend flexibility (Grafana, Datadog, Jaeger, etc.)
- Log correlation with traces via instrumentation-pino

**Installation:**
```bash
# Gateway
npm install @fastify/otel @opentelemetry/sdk-node @opentelemetry/api \
  @opentelemetry/instrumentation-http @opentelemetry/exporter-trace-otlp-http \
  pino-opentelemetry-transport

# Sync module (same)
npm install @fastify/otel @opentelemetry/sdk-node @opentelemetry/api \
  @opentelemetry/instrumentation-http @opentelemetry/exporter-trace-otlp-http \
  pino-opentelemetry-transport
```

**Configuration pattern:**
```typescript
// instrumentation.ts (loaded before app)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [new HttpInstrumentation()],
});

sdk.start();
```

**@fastify/otel registration:**
```typescript
import fastifyOtel from '@fastify/otel';

// Must register BEFORE routes
await fastify.register(fastifyOtel, {
  // Options
});
```

**NOT recommended:**
- `@opentelemetry/instrumentation-fastify` — deprecated, EOL June 2025
- `@opentelemetry/auto-instrumentations-node` — too heavy, instruments everything

---

### 4. Auth Simplification

**Context:** Simplify token setup and add diagnostics. NOT replacing auth system.

**Existing stack is sufficient:**
- `@fastify/jwt` v7.2.4 (gateway) — JWT verification
- `bcryptjs` v2.4.3 (gateway) — password hashing
- Session auth (sync dashboard) — unchanged

**Recommended additions: None**

Auth simplification is a workflow/UX improvement, not a library change:

1. **Token diagnostics endpoint** — Use existing @fastify/jwt to decode and validate
2. **Setup wizard** — UI flow in dashboard (shadcn components)
3. **Token rotation** — Extend existing JWT implementation

**Implementation notes:**
- Add `/api/auth/diagnostics` endpoint for token validation/debugging
- Add clear error messages for common auth failures
- Consider adding `@fastify/rate-limit` (^10.0.0) for auth endpoint protection

**Optional addition:**

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@fastify/rate-limit` | ^10.0.0 | Rate limiting auth endpoints | Prevent brute force |

---

## Integration Notes

### How New Stack Integrates with Existing

**PostgreSQL Adapter:**
```
objetiva-sync/
  src/adapters/
    sqlserver/           # Existing
    postgresql/          # NEW - mirrors sqlserver structure
      index.ts
      postgresql-adapter.ts
    index.ts             # Export both adapters
```

**shadcn/ui in Gateway Dashboard:**
```
objetiva-sync-gateway/dashboard/
  src/
    components/
      ui/                # NEW - shadcn components
        button.tsx
        card.tsx
        table.tsx
      existing/          # Preserve existing components initially
    lib/
      utils.ts           # Already has cn() helper
```

**OpenTelemetry Setup:**
```
objetiva-sync/
  src/
    instrumentation.ts   # NEW - OTel bootstrap
    server.ts            # Import instrumentation first

objetiva-sync-gateway/
  src/
    instrumentation.ts   # NEW - OTel bootstrap
    server.ts            # Import instrumentation first
```

### Version Compatibility Matrix

| Dependency | objetiva-sync | objetiva-sync-gateway | Notes |
|------------|---------------|----------------------|-------|
| Node.js | >=20.0.0 | >=20.0.0 | Both aligned |
| Fastify | 5.2.0 | 4.28.1 | Version mismatch OK for now |
| `pg` | NEW ^8.18.0 | ^8.17.2 | Align to ^8.18.0 |
| Pino | 9.5.0 | 9.5.0 | Aligned |
| Zod | 3.23.8 | 3.23.8 | Aligned |
| React | N/A | 18.3.1 | Gateway only |
| Tailwind | N/A | 3.4.1 | Gateway dashboard only |

---

## Not Recommended

### Libraries to Avoid

| Library | Why Not |
|---------|---------|
| `postgres` (Postgres.js) | Different API, prepared statement issues in AWS, smaller ecosystem |
| `@opentelemetry/instrumentation-fastify` | Deprecated, EOL June 2025 |
| `@opentelemetry/auto-instrumentations-node` | Too heavy, instruments unnecessary modules |
| `better-auth` | Overkill for existing JWT setup, adds complexity |
| `passport` | Express-centric, unnecessary for Fastify with @fastify/jwt |
| `prisma` (for sync source) | Already using Drizzle for SQLite, raw pg fits adapter pattern better |

### Approaches to Avoid

| Approach | Why Not |
|----------|---------|
| Full HTMX->React rewrite of sync dashboard | Different purpose, HTMX is appropriate for sync module |
| New auth library | Existing @fastify/jwt is sufficient, problem is UX not tooling |
| GraphQL for schema endpoint | REST is simpler, already working |
| Automatic schema sync (CDC) | Too complex, manual control is preferred per PROJECT.md |

---

## Summary: Installation Commands

**objetiva-sync (sync module):**
```bash
# PostgreSQL adapter
npm install pg@^8.18.0
npm install -D @types/pg@^8.16.0

# Observability
npm install @fastify/otel @opentelemetry/sdk-node @opentelemetry/api \
  @opentelemetry/instrumentation-http @opentelemetry/exporter-trace-otlp-http \
  pino-opentelemetry-transport
```

**objetiva-sync-gateway:**
```bash
# Observability
npm install @fastify/otel @opentelemetry/sdk-node @opentelemetry/api \
  @opentelemetry/instrumentation-http @opentelemetry/exporter-trace-otlp-http \
  pino-opentelemetry-transport

# Dashboard (in dashboard/ subdirectory)
cd dashboard
npx shadcn@latest init
npx shadcn@latest add button card table dialog alert badge tabs toast
```

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| PostgreSQL adapter (pg) | HIGH | Library already in use, well-documented, matches existing pattern |
| shadcn/ui setup | HIGH | Official docs verified, unified radix-ui package confirmed Feb 2026 |
| @fastify/otel | HIGH | Official Fastify team package, replaces deprecated instrumentation |
| OpenTelemetry SDK | MEDIUM | SDK versions change rapidly, verify latest before implementing |
| Auth simplification | HIGH | No new libraries needed, workflow improvement only |

---

## Sources

**PostgreSQL Client:**
- [pg - npm](https://www.npmjs.com/package/pg) - v8.18.0 latest
- [node-postgres documentation](https://node-postgres.com/)
- [node-postgres vs postgres.js comparison](https://github.com/brianc/node-postgres/issues/3391)

**shadcn/ui:**
- [shadcn/ui Installation](https://ui.shadcn.com/docs/installation)
- [February 2026 - Unified Radix UI Package](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui)
- [radix-ui npm](https://www.npmjs.com/package/radix-ui) - v1.4.3 latest

**OpenTelemetry:**
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [@fastify/otel GitHub](https://github.com/fastify/otel)
- [@opentelemetry/sdk-node npm](https://www.npmjs.com/package/@opentelemetry/sdk-node) - v0.211.0 latest
- [pino-opentelemetry-transport GitHub](https://github.com/pinojs/pino-opentelemetry-transport)

**Fastify Auth:**
- [@fastify/jwt GitHub](https://github.com/fastify/fastify-jwt)
- [Fastify Ecosystem](https://fastify.dev/ecosystem/)

---

## Previous Research (v1.0)

The following research from v1.0 milestone remains valid and is preserved for reference:

### PostgreSQL Schema Introspection & TypeScript Codegen

For schema-driven synchronization, the stack uses:
- **Introspection**: Prisma `db pull` (95% confidence)
- **Zod Generation**: `zod-prisma-types` generator (90% confidence)
- **Query Building**: Prisma Client (85% confidence)
- **Drift Detection**: Prisma `migrate diff` in CI (85% confidence)

This architecture is already implemented in v1.0/v1.1-rc and continues unchanged for v1.1-rc2.

---
*Researched: 2026-02-11 (v1.1-rc2)*
*Previous research: 2026-01-26 (v1.0)*
