---
phase: 18-pre-flight-validator
plan: "02"
subsystem: objetiva-sync-gateway
tags: [preflight, startup-validation, setup-only-mode, env-writer, fastify, tdd]
dependency_graph:
  requires: ["18-01"]
  provides: ["GET /api/setup/preflight", "startup validation", "setup-only mode", "centralized env writes"]
  affects: ["objetiva-sync-gateway/src/server.ts", "objetiva-sync-gateway/src/app.ts", "objetiva-sync-gateway/src/routes/preflight.ts", "objetiva-sync-gateway/src/routes/setup.ts", "objetiva-sync-gateway/src/routes/auth.ts"]
tech_stack:
  added: ["@fastify/rate-limit@10.3.0"]
  patterns: ["5-check preflight", "setup-only mode onRequest hook", "shared singleton state via system-state.ts", "TDD red-green"]
key_files:
  created:
    - objetiva-sync-gateway/src/routes/preflight.ts
    - objetiva-sync-gateway/src/lib/system-state.ts
    - objetiva-sync-gateway/tests/integration/preflight.integration.test.ts
  modified:
    - objetiva-sync-gateway/src/server.ts
    - objetiva-sync-gateway/src/app.ts
    - objetiva-sync-gateway/src/routes/setup.ts
    - objetiva-sync-gateway/src/routes/auth.ts
    - objetiva-sync-gateway/src/routes/dashboard.ts
decisions:
  - "Extracted systemState to system-state.ts to break circular dependency (app.ts <-> server.ts)"
  - "Setup-only mode determined by env_vars check status (fail = setup-only, pass+db-fail = degraded)"
  - "GATEWAY_PUBLIC_URL is optional — triggers warn not fail in env_vars check"
  - "DB checks in preflight run against shared prisma singleton (not a new client)"
  - "Startup banner prints to stderr to avoid polluting JSON log output"
metrics:
  duration: "~9 minutes"
  completed: "2026-03-05"
  tasks: 2
  files: 7
---

# Phase 18 Plan 02: Startup Validation, Preflight Endpoint, and Env-Writer Refactor Summary

**One-liner:** 5-check live preflight endpoint with setup-only mode startup validation and centralized env-writer replacing all 4 inline .env writes.

## What Was Built

### Task 1: Startup validation, setup-only mode, and preflight route (TDD)

**New: `src/routes/preflight.ts`**

Exports `registerPreflightRoutes(app)` and `runAllPreflightChecks()`. Implements 5 live checks:

| id | Check | Logic |
|----|-------|-------|
| `env_vars` | Environment variables | DATABASE_URL, JWT_SECRET, SYNC_PASSWORD required; GATEWAY_PUBLIC_URL optional (warn) |
| `db_connectivity` | Database connectivity | `prisma.$queryRaw\`SELECT 1\`` with 5s timeout |
| `db_tables` | Database tables | Queries pg_tables for 4 required tables |
| `jwt_configured` | JWT configuration | Warns if JWT_SECRET matches either default sentinel |
| `env_file_writable` | .env file writable | `fs.access(envPath, W_OK)`, creates file if missing |

Route: `GET /api/setup/preflight` with per-route rate limit (10 req/min via @fastify/rate-limit).
Response: `{ ready: boolean, checks: PreflightCheck[], timestamp: string }`.
Checks run live on every request — never cached.

**New: `src/lib/system-state.ts`**

Shared singleton with `dbConnected`, `dbError`, `startTime`, `lastDbCheck`, `startupMode`, `preflightChecks`. Extracted from server.ts to break the circular dependency between app.ts and server.ts.

**Modified: `src/server.ts`**

- Extended with `startupMode: 'normal' | 'setup-only' | 'degraded'` and `preflightChecks`
- Calls `runAllPreflightChecks()` before `buildApp()` so startupMode is set before the onRequest hook evaluates it
- Prints startup banner to stderr with numbered checklist (pass/fail/warn per check)
- Determines mode: env_vars fail → setup-only; db_connectivity fail → degraded; both pass → normal
- Re-exports systemState for backward compatibility

**Modified: `src/app.ts`**

- Registers `@fastify/rate-limit` with `{ global: false }` before all routes (per-route opt-in)
- Adds `onRequest` hook for setup-only mode: returns 503 for all URLs not in allowlist `/health`, `/metrics`, `/setup`, `/api/setup/`
- Registers `registerPreflightRoutes(app)` after health/metrics routes
- Imports `systemState` from `system-state.ts` (not server.ts)

**Modified: `src/routes/dashboard.ts`**

Updated import from `server.ts` to `system-state.ts` to avoid triggering server startup during tests.

**Integration tests: `tests/integration/preflight.integration.test.ts`**

7 tests (all pass):
- Returns 200 with ready boolean, checks array, and valid ISO timestamp
- Exactly 5 checks
- Correct check IDs in order
- Each check has id, name, status, message, remediation
- jwt_configured returns "warn" with default secret
- env_file_writable returns "pass" in test env
- ready is false when any check fails/warns

### Task 2: Refactor all inline .env writes to env-writer

Replaced 4 inline `fs.readFile` + `string.replace` + `fs.writeFile` blocks with `writeEnvVar` calls:

| File | Location | Variable | Before | After |
|------|----------|----------|--------|-------|
| `auth.ts` | `change-password` handler | `SYNC_PASSWORD` | manual read-replace-write | `await writeEnvVar('SYNC_PASSWORD', newPassword)` |
| `setup.ts` | `save-jwt-secret` handler | `JWT_SECRET` | manual read-replace-write | `await writeEnvVar('JWT_SECRET', jwtSecret)` |
| `setup.ts` | `verify-tables` handler | `DATABASE_URL` | manual read-replace-write | `await writeEnvVar('DATABASE_URL', databaseUrl)` |
| `setup.ts` | `set-password` handler | `SYNC_USERNAME`, `SYNC_PASSWORD` | manual read-replace-write (2 vars) | `await writeEnvVar(...)` x2 |

Removed unused `fs` and `path` imports from auth.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Circular dependency: app.ts importing from server.ts**

- **Found during:** Task 1 implementation — app.ts needed systemState but importing from server.ts would execute `start()` during test runs
- **Issue:** server.ts calls `start()` as a side effect at module level. dashboard.ts imported `systemState` from server.ts, causing vitest to execute `start()` when building the test app, resulting in EADDRINUSE port conflicts
- **Fix:** Extracted `systemState` to `src/lib/system-state.ts` as a clean singleton. Updated server.ts to import from it (re-exporting for backward compat) and app.ts + dashboard.ts to import directly from it
- **Files modified:** `src/lib/system-state.ts` (new), `src/server.ts`, `src/app.ts`, `src/routes/dashboard.ts`
- **Commit:** a0b2225

## Self-Check

- [x] `objetiva-sync-gateway/src/routes/preflight.ts` — FOUND
- [x] `objetiva-sync-gateway/src/lib/system-state.ts` — FOUND
- [x] `objetiva-sync-gateway/tests/integration/preflight.integration.test.ts` — FOUND (7 tests, all pass)
- [x] No inline .env writes remain in setup.ts and auth.ts
- [x] @fastify/rate-limit in package.json
- [x] Task 1 commit: a0b2225
- [x] Task 2 commit: b5ee4d1

## Self-Check: PASSED
