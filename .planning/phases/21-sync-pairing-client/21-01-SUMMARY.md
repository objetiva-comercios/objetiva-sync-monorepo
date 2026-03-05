---
phase: 21-sync-pairing-client
plan: 01
subsystem: sync-dashboard-api
tags: [pairing, gateway-client, sqlite-config, claim-route, tdd]
dependency_graph:
  requires: [20-gateway-pairing-routes]
  provides: [claim-proxy-route, sqlite-first-gateway-config]
  affects: [gateway-client, config-api-routes]
tech_stack:
  added: []
  patterns: [sqlite-first-config, async-gateway-client, fetch-proxy]
key_files:
  created:
    - objetiva-sync/tests/unit/config-pairing-claim.test.ts
    - objetiva-sync/tests/unit/gateway-client.test.ts
  modified:
    - objetiva-sync/src/dashboard/routes/api/config.ts
    - objetiva-sync/src/services/gateway-client.ts
decisions:
  - POST /api/config/pairing/claim validates null jwtSecret/syncPassword before saving — 502 with descriptive error, no partial saves
  - setConfig called without explicit `false` third arg for plain-text keys (uses default)
  - getGatewayUrl and getGatewayJwtSecret made async using SQLite-first pattern; callers already used async correctly
metrics:
  duration: 273s
  completed: "2026-03-05"
  tasks_completed: 1
  files_changed: 4
---

# Phase 21 Plan 01: Claim Proxy Route + SQLite-First Gateway Config Summary

**One-liner:** POST /api/config/pairing/claim proxies to gateway and persists 4 SQLite config keys; gateway-client now reads REMOTE_API_URL and JWT_SECRET from SQLite before env fallback.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Claim proxy route + gateway-client async update | 9b3d998 | Done |

## What Was Built

### POST /api/config/pairing/claim

Added to `objetiva-sync/src/dashboard/routes/api/config.ts`:

- Accepts `{ gatewayUrl, code }` body; validates both present (400 if missing)
- Normalizes `gatewayUrl` by stripping trailing slashes
- Proxies `POST /api/pairing/claim` to gateway with 10s timeout
- Maps gateway responses: 404 -> "Codigo invalido o expirado", 410 -> "Codigo ya fue utilizado", non-ok -> 502
- Validates `jwtSecret` and `syncPassword` are non-null before saving (502 if either null)
- Saves 4 keys: `REMOTE_API_URL` (plain), `REMOTE_API_USERNAME='sync'` (plain), `REMOTE_API_PASSWORD` (encrypted), `JWT_SECRET` (encrypted)
- Returns `{ success: true, gatewayUrl }` on success
- Catch-all wraps entire body — network errors return 502 "No se pudo conectar al gateway"

### gateway-client.ts SQLite-First Config

- `getGatewayUrl()` changed to `async`: reads `REMOTE_API_URL` from SQLite, falls back to `process.env.GATEWAY_URL || 'http://localhost:3335'`
- `getGatewayJwtSecret()` changed to `async`: reads `JWT_SECRET` from SQLite, decrypts if `encrypted=true`, falls back to `process.env.JWT_SECRET`
- `getJwtToken()` changed to `async`: awaits `getGatewayJwtSecret()`
- `notifyGatewayCancellation()` already async: updated to `await getGatewayUrl()`
- No other callers of `getJwtToken` found in codebase (grep confirmed)

## Tests Written

### config-pairing-claim.test.ts (12 tests)
- Input validation: missing gatewayUrl, missing code, missing both
- Success path: saves 4 keys with correct values and encryption, URL normalization, encrypt called with plaintext
- Gateway errors: 404 -> Spanish 404, 410 -> Spanish 410, 500 -> 502, ECONNREFUSED -> 502
- Null rejection: null jwtSecret -> 502, null syncPassword -> 502, no keys saved

### gateway-client.test.ts (5 tests)
- getGatewayUrl via notifyGatewayCancellation: SQLite value used over env
- getGatewayUrl: env fallback when SQLite returns null
- getJwtToken: SQLite JWT_SECRET decrypted and used for signing
- getJwtToken: env JWT_SECRET used when SQLite returns null
- getJwtToken: throws when neither source has JWT_SECRET

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `objetiva-sync/tests/unit/config-pairing-claim.test.ts` — FOUND
- [x] `objetiva-sync/tests/unit/gateway-client.test.ts` — FOUND
- [x] `objetiva-sync/src/dashboard/routes/api/config.ts` — FOUND (contains `api/config/pairing/claim`)
- [x] `objetiva-sync/src/services/gateway-client.ts` — FOUND (contains `getConfig.*REMOTE_API_URL`)
- [x] Commit `9b3d998` — FOUND
- [x] 17/17 tests pass

## Self-Check: PASSED
