# Phase 18: Pre-Flight Validator - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Gateway validates all environment and infrastructure requirements at startup and fails fast with actionable errors. Exposes GET /api/setup/preflight with structured JSON checklist. Centralizes .env writing with mutex and special character escaping. Requirements: PF-01, PF-02, PF-03, PF-04, PF-05.

</domain>

<decisions>
## Implementation Decisions

### Startup failure behavior
- Gateway starts in **setup-only mode** when critical env vars are missing — only setup wizard and preflight routes are available, all other routes return 503
- Required env vars validated at startup: `DATABASE_URL` (critical), `JWT_SECRET` (critical), `SYNC_PASSWORD` (critical), `GATEWAY_PUBLIC_URL` (optional, warn only)
- If DATABASE_URL is present but PostgreSQL is unreachable: start in **degraded mode** (current behavior preserved) — setup wizard accessible, preflight reports the failure
- If required tables are missing: start normally but preflight reports which tables are missing with a migration hint (`npx prisma migrate deploy`)
- Exit with code 1 only on truly unrecoverable errors (port conflict, file system failure) — not on missing config

### Preflight endpoint design
- `GET /api/setup/preflight` — **no authentication required** (needed during initial setup before credentials exist)
- Returns 5 checks matching requirements: env_vars, db_connectivity, db_tables, jwt_configured, env_file_writable
- Response format: flat JSON array with overall `ready` boolean flag
- Each check: `{ id, name, status: "pass"|"fail"|"warn", message, remediation }`
- Overall structure: `{ ready: boolean, checks: [...], timestamp }`
- Rate-limit the endpoint (10 req/min per IP) to prevent abuse since it's unauthenticated

### .env writing strategy
- **Single centralized module** (`src/utils/env-writer.ts`) replaces all scattered .env writes in setup.ts and auth.ts
- **In-memory async mutex** (simple promise-based lock, no external dependency) — sufficient for single-process Docker container
- **Always double-quote values** in .env: `KEY="value"` — handles `$`, `#`, spaces, quotes by escaping inner quotes with `\"`
- If .env file doesn't exist, create from `.env.example` template if available, otherwise create empty with header comment
- After writing, **update `process.env` in-place** for immediate effect without restart (hot reload)
- Fix ENV-04 bug: refactor all 4 raw .env write locations (setup.ts ×3, auth.ts ×1) to use the new centralized writer

### Error message style
- **English** for all error messages (codebase is mixed but English for technical output is consistent)
- Structured **Pino JSON** for production (machine-parseable in Docker logs) plus a human-readable **startup banner** on stderr for interactive use
- Include specific remediation commands where applicable:
  - Missing env var → `Set DATABASE_URL in your .env file`
  - DB unreachable → `Check PostgreSQL is running and DATABASE_URL is correct`
  - Missing tables → `Run: npx prisma migrate deploy`
  - JWT not set → `Run setup wizard at /setup or set JWT_SECRET in .env`
- Startup banner format: numbered checklist with ✓/✗ per check, shown once at boot

### Claude's Discretion
- Exact mutex implementation details (promise chain vs semaphore pattern)
- Startup banner visual formatting
- Preflight endpoint response field naming conventions
- Order of checks during startup validation
- Whether to add an `x-preflight-status` header to all responses when in degraded mode

</decisions>

<specifics>
## Specific Ideas

- The 4 required tables are: `articulos`, `comprobantes_cabecera`, `comprobantes_detalle`, `comprobantes_pagos` — these are checked via Prisma introspection or raw SQL
- ENV-04 bug is confirmed in `auth.ts:271-274` and `setup.ts:879-881` — passwords with `$`, `#`, or quotes corrupt the .env file
- Current `systemState` object in `server.ts` already tracks `dbConnected`, `dbError` — extend this rather than creating a parallel state
- Health endpoint (`/health`) already exists — preflight is separate (health = runtime liveness, preflight = configuration completeness)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `systemState` in `server.ts`: Already tracks DB status — extend with preflight results
- `health.ts` route: Pattern for structured health responses — preflight follows similar shape
- `setup.ts` setup wizard: Current 4-step wizard will consume preflight data to show check status
- Pino logger: Already configured globally, use for structured startup messages

### Established Patterns
- Fastify route registration via `app.register()` in `app.ts` — preflight route follows same pattern
- `.env` path resolution: `dotenv` loaded at process start in `server.ts` — writer must use same path
- JWT fallback: `process.env.JWT_SECRET || 'change-me-in-production'` in `app.ts` — preflight should flag when fallback is active

### Integration Points
- `server.ts:start()` — Insert validation before `buildApp()` call
- `app.ts:buildApp()` — Register new `/api/setup/preflight` route
- `setup.ts` — Replace 3 inline `.env` writes with `env-writer` calls
- `auth.ts` — Replace 1 inline `.env` write with `env-writer` call
- `server.ts:systemState` — Extend with `preflightChecks` array

</code_context>

<deferred>
## Deferred Ideas

- Setup access token shown in container logs for first-time security — Phase 19 (INT-04 blocker)
- QR code for pairing — Future requirement PAIR-F01
- Hot reload of JWT_SECRET after .env write (currently requires restart for JWT changes) — evaluate in Phase 19

</deferred>

---

*Phase: 18-pre-flight-validator*
*Context gathered: 2026-03-05*
