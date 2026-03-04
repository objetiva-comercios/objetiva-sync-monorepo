# Architecture Patterns: v1.2 Setup & Pairing

**Domain:** Pairing code exchange, setup wizard, Docker pre-flight checks
**Researched:** 2026-03-04
**Milestone:** v1.2 — Simplified installation and gateway-sync pairing
**Confidence:** HIGH (based on direct codebase analysis + verified patterns)

---

## Executive Summary

The v1.2 milestone adds three integrated capabilities to the existing Fastify + Docker + Tailscale architecture: a pairing code flow that replaces manual JWT_SECRET sharing, an improved setup wizard that generates a complete `.env` for docker-compose, and pre-flight validation that runs inside the Docker container at startup. All three integrate as additions to existing routes and services — no existing data flows change.

The pairing code mechanism is a short-lived, in-memory token exchange. Gateway generates a 6-character alphanumeric code and stores it in memory with a TTL. Sync operator enters the code in the sync dashboard; sync calls a new gateway endpoint that returns the JWT_SECRET, gateway URL, and credentials. Both sides store the results in their respective config stores (SQLite config table on sync, `.env` file on gateway). This is the only new HTTP endpoint that must remain unauthenticated.

The setup wizard extends the existing `GET /setup` inline-HTML page (954 lines, 3 existing steps) into a multi-step wizard with `.env` generation and live validation. The existing setup route endpoints are preserved and extended. A new `GET /api/setup/generate-env` endpoint downloads the complete `.env` for docker-compose.

Pre-flight checks run once at gateway container startup via a TypeScript module called before `app.listen()`. They validate required env vars, test PostgreSQL connectivity, and produce actionable error messages before Fastify starts accepting requests.

---

## Current Architecture (Relevant Paths Only)

```
[Windows Machine]                        [VPS / Docker]
+---------------------------+            +---------------------------+
|  objetiva-sync (Node.js)  |            |  objetiva-sync-gateway    |
|  Port 3000                |  HTTP/JWT  |  Port 3335 (via Traefik)  |
|                           |----------->|                           |
|  SQLite (Drizzle ORM)     |            |  PostgreSQL (Prisma ORM)  |
|  - config (key/value)     |            |  - entity tables          |
|  - connection_config      |            |                           |
|  - queries                |            |  .env file                |
|  - sync_state             |            |  - JWT_SECRET             |
|  .env file                |            |  - DATABASE_URL           |
|  - REMOTE_API_URL         |            |  - SYNC_USERNAME          |
|  - REMOTE_API_USERNAME    |            |  - SYNC_PASSWORD          |
|  - REMOTE_API_PASSWORD    |            |  - TRAEFIK_DOMAIN         |
+---------------------------+            +---------------------------+
         |                                          |
         +------------------------------------------+
                      Tailscale mesh
```

### Config Storage Asymmetry

This is critical context for designing pairing and setup:

| System | Config Store | How Written | Who Reads |
|--------|-------------|-------------|-----------|
| Sync | SQLite config table (key/value) | setConfig(key, value) in config-repo.ts | getConfig(key) at runtime |
| Sync | .env file | updateEnvFile() in env.ts on startup only | dotenv.config() on startup |
| Gateway | .env file | fs.writeFile() in setup.ts and auth.ts | process.env.* at runtime |
| Gateway | process.env | In-memory, lost on restart | process.env.* at runtime |

**Implication:** Gateway `.env` changes require a container restart to take effect. The setup wizard must communicate this. Sync can store pairing results in the SQLite config table without restart — the setConfig path is designed for runtime use and is already used for REMOTE_API_URL, REMOTE_API_USERNAME, REMOTE_API_PASSWORD.

---

## Component Boundaries for New Features

### New Component: Pairing Code Service (Gateway)

**Responsibility:** Generate short-lived pairing codes; respond to claim requests from sync; return gateway connection credentials.

**Lives in:** `objetiva-sync-gateway/src/services/pairing.ts`

**State:** In-memory Map keyed by code string — codes do not need to survive container restart (restart invalidates any pending pairing anyway).

```typescript
interface PairingEntry {
  code: string;        // 6-character uppercase alphanumeric
  expiresAt: number;   // Date.now() + TTL (10 minutes)
  createdAt: number;
  claimed: boolean;    // prevent double-claim
}
```

**TTL:** 10 minutes. Short enough to reduce interception risk, long enough for operator to complete pairing on the sync dashboard.

**Code format:** 6-character alphanumeric (uppercase), avoiding ambiguous chars (0/O, 1/I/l). Provides approximately 2.1 billion combinations — sufficient for short-lived interactive pairing.

**Why in-memory (not PostgreSQL):** Codes expire in 10 minutes, survive no restarts, and contain no business data. Adding a Prisma model adds migration complexity for transient data. Redis is not in the stack. In-memory is the right fit.

### New Routes: Pairing Endpoints (Gateway)

**Route file:** `objetiva-sync-gateway/src/routes/pairing.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/pairing/generate | JWT (admin) | Generate new pairing code; returns code and expiresAt |
| POST | /api/pairing/claim | None (pre-auth) | Sync submits code; gateway returns credentials |
| GET | /api/pairing/status | JWT (admin) | Current pairing state (code exists, claimed, expiry) |

**Security note for /api/pairing/claim:** This endpoint is unauthenticated by design — sync cannot authenticate until pairing is complete. The code is the authenticator. Mitigations: rate limit to 5 attempts per IP per minute; always return HTTP 200 with success:false on wrong code (no timing leaks); invalidate code immediately on successful claim (claimed=true prevents reuse).

**What claim returns:**
```typescript
{
  success: true,
  gatewayUrl: string,       // e.g., "https://sync-gateway.sanchezrepuestos.com.ar"
  jwtSecret: string,        // the JWT_SECRET from gateway .env
  syncUsername: string,     // SYNC_USERNAME
  syncPassword: string,     // SYNC_PASSWORD
}
```

**Why return JWT_SECRET:** The sync needs the same JWT_SECRET as the gateway to sign tokens for future auth calls. The pairing code is the one-time authorization to receive this secret. The claim endpoint only works once per code.

### New API Routes: Pairing Client (Sync)

**Route file:** `objetiva-sync/src/dashboard/routes/api/pairing.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/pairing/submit | Session | Sync submits code to gateway; stores result in SQLite config |
| GET | /api/pairing/status | Session | Returns current pairing state from SQLite config |

**What sync stores after successful claim (in SQLite config table):**

```
Key                  Value                    Encrypted
REMOTE_API_URL       gatewayUrl               No
REMOTE_API_USERNAME  syncUsername             No
REMOTE_API_PASSWORD  syncPassword             Yes (existing encrypt() utility)
JWT_SECRET           jwtSecret                Yes (existing encrypt() utility)
PAIRING_STATUS       "paired"                 No
PAIRING_AT           ISO timestamp            No
```

**Sync dashboard UI:** A new "Conectar Gateway" section in the existing config/api dashboard view. Operator enters: gateway URL + pairing code. On success, UI shows "Conectado a [gateway URL]". This is an addition to the existing config/api.ejs view — not a new page.

### Extended Component: Setup Wizard (Gateway)

**Existing:** `GET /setup` returns 954-line inline HTML with 3 steps (DB config, JWT secret, admin password). Existing POST endpoints write individual values to `.env`.

**Extended:** Multi-step wizard with client-side step tracking via localStorage. No server-side wizard state needed.

**Steps:**

| Step | Title | Status | What it configures |
|------|-------|--------|-------------------|
| 1 | PostgreSQL | existing | DATABASE_URL, verify tables via existing /api/setup/test-db |
| 2 | Dominio Traefik | new | TRAEFIK_DOMAIN (subdomain for Traefik labels), APP_NAME |
| 3 | JWT Secret | existing | JWT_SECRET via existing /api/setup/save-jwt-secret |
| 4 | Credenciales | existing | SYNC_USERNAME, SYNC_PASSWORD via existing /api/setup/set-password |
| 5 | Generar .env | new | Download complete .env for docker-compose |
| 6 | Enlazar Sync | new | Generate pairing code; display 6-char code for operator |

**New endpoint:** `GET /api/setup/generate-env` assembles complete `.env` content from all configured values. Returns with `Content-Disposition: attachment; filename=".env"` to trigger browser download.

**New endpoint:** `POST /api/setup/set-domain` writes TRAEFIK_DOMAIN and APP_NAME to `.env`. Same pattern as existing save-jwt-secret handler.

**TRAEFIK_DOMAIN env var:** Currently hardcoded in `docker-compose.yml` as `sync-gateway.sanchezrepuestos.com.ar`. After this milestone, `docker-compose.yml` references `${TRAEFIK_DOMAIN}` from the `.env` file.

**Why step 6 comes last:** Pairing requires the gateway to be running with its final configuration. The operator runs docker-compose up with the generated `.env`, then returns to the setup page to get the pairing code. The setup page must be reachable after the restart (existing behavior — `/setup` is always available without auth).

### New Component: Pre-Flight Validator (Gateway)

**Purpose:** Validate all required environment variables and external dependencies before Fastify starts accepting requests. Fail fast with actionable error messages.

**Location:** `objetiva-sync-gateway/src/lib/preflight.ts`

**Invocation:** Called in `server.ts` before `app.listen()`. If any critical check fails, logs structured error and calls `process.exit(1)`.

**Checks in order:**

| Check | Critical | What it validates |
|-------|----------|------------------|
| env-required | Yes | DATABASE_URL, JWT_SECRET, SYNC_USERNAME, SYNC_PASSWORD set and not placeholder values |
| env-format | Yes | DATABASE_URL is valid postgresql:// URL |
| postgres-connect | Yes | Can open PostgreSQL connection within 10s timeout |
| postgres-tables | Yes | Required tables exist (articulos, comprobantes_cabecera, comprobantes_detalle, comprobantes_pagos) |
| jwt-strength | No (warn) | JWT_SECRET is at least 32 characters |

**Output format (uses existing pino logger):**
```
{"level":"info","msg":"[PREFLIGHT] env-required: PASS - All required variables present"}
{"level":"info","msg":"[PREFLIGHT] postgres-connect: PASS - Connected in 234ms"}
{"level":"warn","msg":"[PREFLIGHT] jwt-strength: WARN - JWT_SECRET is 16 chars, recommend 32+"}
{"level":"info","msg":"[PREFLIGHT] All critical checks passed (1 warning). Starting server..."}
```

**On failure:**
```
{"level":"error","msg":"[PREFLIGHT] postgres-connect: FAIL - Connection refused. Check DATABASE_URL and that PostgreSQL is running."}
{"level":"error","msg":"[PREFLIGHT] Critical check failed. Exiting."}
```

**Why TypeScript not a shell script:** Existing healthcheck in `docker-compose.yml` uses a Node.js one-liner. Pre-flight in TypeScript uses the existing pino logger, reuses the pg connection pattern already in Prisma's dependency chain, and stays in the same language as the rest of the codebase.

**PostgreSQL check implementation:** Uses `pg` library directly (already a transitive dependency via Prisma). Does NOT instantiate Prisma (Prisma would run its own migration checks). A raw pg.Client connect + SELECT 1 is sufficient for the connectivity check.

---

## Data Flow Changes

### Pairing Flow (New)

```
Gateway Admin          Gateway               Sync Operator         Sync
     |                    |                       |                   |
     | POST /api/pairing/ |                       |                   |
     | generate (JWT auth)|                       |                   |
     |------------------->|                       |                   |
     | { code: "XK7P2M", |                       |                   |
     |   expiresAt: ... } |                       |                   |
     |<-------------------|                       |                   |
     |                    |                       |                   |
     | [displays code to operator out-of-band]    |                   |
     |                    |                       |                   |
     |                    |    [operator enters code in sync UI]      |
     |                    |                       | POST /api/pairing/|
     |                    |                       | submit            |
     |                    |                       |------------------>|
     |                    |                       | (gatewayUrl,code) |
     |                    |<-- POST /api/pairing/claim (no auth) -----|
     |                    |    { code, gatewayUrl }                   |
     |                    |                                           |
     |                    |-- { success: true, jwtSecret,            |
     |                    |    syncUsername, syncPassword } --------->|
     |                    |                                           |
     |                    |       [sync saves to SQLite config]       |
     |                    |                       |{ status:"paired" }|
     |                    |                       |<------------------|
```

### Setup Wizard Flow (Extended)

```
Operator Browser         Gateway /setup          Gateway .env file
      |                       |                        |
      | GET /setup            |                        |
      |---------------------->|                        |
      | [multi-step wizard]   |                        |
      |<----------------------|                        |
      |                       |                        |
      | Step 1: POST /api/setup/test-db                |
      |---------------------->| (verify DB connect)    |
      |<-- { success: true } -|                        |
      |                       |                        |
      | Step 2: POST /api/setup/set-domain             |
      |---------------------->| write TRAEFIK_DOMAIN ->|
      |<-- { success: true } -|                        |
      |                       |                        |
      | Step 3: POST /api/setup/save-jwt-secret        |
      |---------------------->| write JWT_SECRET ----->|
      |<-- { success: true } -|                        |
      |                       |                        |
      | Step 4: POST /api/setup/set-password           |
      |---------------------->| write SYNC_USERNAME/PW->
      |<-- { success: true } -|                        |
      |                       |                        |
      | Step 5: GET /api/setup/generate-env            |
      |---------------------->| read all config values |
      |                       |<-----------------------|
      | [browser downloads    |                        |
      |  .env file]           |                        |
      |<----------------------|                        |
      |                       |                        |
      | [operator: docker-compose up with new .env]    |
      | [container restarts with new env]              |
      |                       |                        |
      | Step 6: POST /api/pairing/generate (JWT auth)  |
      |---------------------->|                        |
      | { code: "XK7P2M" }   |                        |
      |<----------------------|                        |
      | [operator reads code; enters in sync UI]       |
```

### Pre-Flight Flow (New, at container startup)

```
Docker container start
       |
       v
  server.ts: loadEnv()
       |
       v
  preflight.run()
   |-- check env-required     -> PASS or EXIT(1)
   |-- check env-format       -> PASS or EXIT(1)
   |-- check postgres-connect -> PASS or EXIT(1)
   |-- check postgres-tables  -> PASS or EXIT(1)
   |-- check jwt-strength     -> PASS or WARN
       |
       v  (all critical checks pass)
  buildApp() + app.listen(3335)
       |
       v
  docker healthcheck polls GET /health every 30s
  (existing endpoint, unchanged)
```

---

## Patterns to Follow

### Pattern: Short-Lived In-Memory Pairing Code

**What:** Store pairing codes in a Map with expiry timestamps. Clean up lazily on read.

**When:** One-time codes with no persistence requirement and short TTL.

**Example:**
```typescript
// src/services/pairing.ts
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

const store = new Map<string, PairingEntry>();

export function generateCode(): { code: string; expiresAt: Date } {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(key); // lazy cleanup
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  store.set(code, { code, expiresAt: now + PAIRING_TTL_MS, claimed: false, createdAt: now });
  return { code, expiresAt: new Date(now + PAIRING_TTL_MS) };
}

export function claimCode(code: string): PairingEntry | null {
  const entry = store.get(code.toUpperCase());
  if (!entry || entry.claimed || entry.expiresAt < Date.now()) {
    if (entry && entry.expiresAt < Date.now()) store.delete(code);
    return null;
  }
  entry.claimed = true;
  return entry;
}
```

### Pattern: Extend Setup Routes Additively

**What:** Add new `POST /api/setup/*` endpoints alongside existing ones. Keep all existing handlers intact.

**When:** Adding steps to the existing wizard.

**What NOT to do:** Do not refactor the existing setup.ts into a class or module system — it is 954 lines of inline HTML with fetch() calls. Keep the same approach for new steps.

### Pattern: Pre-Flight as Synchronous Startup Gate

**What:** Run all validation before `app.listen()`. Exit process on critical failure.

**When:** Container startup where misconfiguration should never result in a partially-running service.

**Example:**
```typescript
// server.ts
import { runPreflight } from './lib/preflight.js';

async function start() {
  await runPreflight();   // process.exit(1) on critical failure
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
}
```

### Pattern: SQLite Config Table for Sync-Side Pairing State

**What:** Use existing setConfig(key, value, encrypted) to store pairing results. Encrypt sensitive values (jwtSecret, syncPassword) using the existing encrypt() utility.

**When:** Storing credentials or secrets in the sync's SQLite config.

**Existing precedent:** REMOTE_API_PASSWORD is already stored encrypted via encrypt() in src/utils/crypto.ts. JWT_SECRET follows the same pattern.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Persisting Pairing Codes to PostgreSQL

**What:** Adding a Prisma migration for a pairing_codes table.

**Why bad:** Codes expire in 10 minutes and are used once. A Prisma migration adds schema surface, migration risk, and operational complexity for data that has zero persistence requirement. Container restart during pairing is acceptable — operator generates a new code.

**Instead:** In-memory Map with lazy TTL cleanup. Document that restart invalidates any pending pairing code.

### Anti-Pattern 2: Writing Pairing Results to Sync's .env

**What:** Writing pairing results to .env on the sync side and requiring npm restart.

**Why bad:** Sync stores all runtime config in the SQLite config table via setConfig(). The existing API client reads REMOTE_API_URL, REMOTE_API_USERNAME, REMOTE_API_PASSWORD from this table at runtime. Writing to .env would break the established pattern and require an unnecessary restart.

**Instead:** Write to SQLite config table. No restart required.

### Anti-Pattern 3: Pre-Flight with No Timeout

**What:** Running database connectivity checks with no timeout, potentially hanging container startup indefinitely.

**Why bad:** Docker start_period and Traefik route detection assume the container will start in a reasonable time. A hung pre-flight causes silent failures.

**Instead:** Set a 10-second timeout per check. On timeout, fail with a clear message indicating which check hung.

### Anti-Pattern 4: Using Shell Scripts for Pre-Flight DB Check

**What:** Running a shell script calling pg_isready in the Dockerfile or entrypoint.

**Why bad:** pg_isready is not available in the Node.js Alpine image without installing the postgresql-client package. Shell scripts are harder to maintain than TypeScript.

**Instead:** Use the pg library (already a transitive dependency via Prisma) in TypeScript for all connectivity checks.

### Anti-Pattern 5: Manual JWT_SECRET Copy-Paste

**What:** Displaying the JWT_SECRET in the gateway setup UI for manual copy by operator.

**Why bad:** The entire point of pairing is to eliminate manual secret sharing. A 64-character hex string copied incorrectly breaks the system silently — auth will fail with no clear error.

**Instead:** The pairing code flow makes secret transfer automatic. The operator enters 6 chars, not 64.

### Anti-Pattern 6: Pairing Code in Query String

**What:** Passing the pairing code as a URL query parameter (e.g., GET /api/pairing/claim?code=XK7P2M).

**Why bad:** Query strings appear in server logs, browser history, and proxy access logs. The code is short-lived but should not be logged anywhere.

**Instead:** POST with JSON body. The code stays in the request body, not the URL.

---

## Integration Points: New vs. Modified

### New Files

| File | System | Type | Description |
|------|--------|------|-------------|
| objetiva-sync-gateway/src/services/pairing.ts | Gateway | Service | In-memory pairing code store with TTL |
| objetiva-sync-gateway/src/routes/pairing.ts | Gateway | Route | /api/pairing/generate, /claim, /status |
| objetiva-sync-gateway/src/lib/preflight.ts | Gateway | Lib | Pre-flight check runner |
| objetiva-sync/src/dashboard/routes/api/pairing.ts | Sync | Route | /api/pairing/submit, /status |

### Modified Files

| File | System | What Changes |
|------|--------|-------------|
| objetiva-sync-gateway/src/app.ts | Gateway | Register registerPairingRoutes() |
| objetiva-sync-gateway/src/server.ts | Gateway | Call runPreflight() before app.listen() |
| objetiva-sync-gateway/src/routes/setup.ts | Gateway | Add step 2 (domain), step 5 (generate-env), step 6 (pairing display) |
| objetiva-sync-gateway/docker-compose.yml | Gateway | Traefik label uses ${TRAEFIK_DOMAIN} env var |
| objetiva-sync-gateway/.env.example | Gateway | Add TRAEFIK_DOMAIN variable with documentation |
| objetiva-sync/src/dashboard/routes/api/index.ts | Sync | Register pairing API routes |
| objetiva-sync/src/dashboard/views/config/api.ejs | Sync | Add "Conectar via codigo" section |

### Unchanged (by design)

- All existing sync batch and entity endpoints
- Existing JWT auth flow between sync and gateway
- Existing /setup steps 1, 3, 4 (DB test, JWT save, password set)
- Existing SQLite schema (no new tables)
- Existing Prisma schema (no new migrations)
- Existing docker-compose healthcheck (/health endpoint)
- All existing dashboard routes, scheduler, retry queue, sync state

---

## Build Order (Phase Dependencies)

### Why This Order

1. **Pre-flight first** — Independent of all new features. No new routes. Low risk. Immediate value (better startup error messages instead of cryptic crashes).

2. **Setup wizard extension second** — The TRAEFIK_DOMAIN variable and generate-env endpoint are prerequisites for pairing (operator needs a running, fully-configured gateway before generating a code). Also independent of sync changes.

3. **Gateway pairing routes third** — Depends on setup wizard (gateway must be configured before generating codes). No sync-side dependencies.

4. **Sync pairing client last** — Depends on gateway pairing routes existing. Sync calls the gateway claim endpoint; that endpoint must exist first.

### Recommended Phase Structure

```
Phase A: Pre-Flight Checks (gateway only)
  New:      src/lib/preflight.ts
  Modified: server.ts (add runPreflight() call)
  Tests:    startup with missing vars exits with clear error
            startup with bad DATABASE_URL exits with clear error
            startup with valid config proceeds to listen

Phase B: Setup Wizard Enhancement (gateway only)
  Modified: routes/setup.ts (add domain step, generate-env endpoint)
  Modified: docker-compose.yml (TRAEFIK_DOMAIN env var)
  Modified: .env.example (TRAEFIK_DOMAIN documentation)
  Tests:    generate-env returns valid .env content with all sections
            set-domain writes TRAEFIK_DOMAIN to .env

Phase C: Pairing Code System (gateway + sync)

  Phase C1: Gateway pairing service and routes
    New:      services/pairing.ts
    New:      routes/pairing.ts
    Modified: app.ts (register routes)
    Tests:    generate code returns 6-char code with expiry
              claim with valid code returns credentials
              claim with invalid code returns success false
              claim with expired code returns success false
              claim with already-claimed code returns success false
              rate limiting on claim endpoint

  Phase C2: Sync pairing client UI
    New:      dashboard/routes/api/pairing.ts
    Modified: dashboard/views/config/api.ejs (add pairing UI section)
    Modified: dashboard/routes/api/index.ts (register routes)
    Tests:    submit with valid code saves config to SQLite
              submit with invalid code returns error
              status returns pairing state from SQLite
```

---

## Scalability Considerations

| Concern | Current Scale | Impact | Notes |
|---------|--------------|--------|-------|
| Pairing code in-memory | 1 gateway instance | None | Codes are single-use, 10min TTL |
| Multiple pairing attempts | Setup-time only (low freq) | None | Rate limiting by IP is sufficient |
| Pre-flight DB check | Once at container startup | None | Not in the request hot path |
| Setup wizard state | Client-side localStorage | None | Eliminates all server-side wizard state |
| Generate-env endpoint | Called once per setup | None | Simple .env string assembly |

---

## Tailscale Integration Notes

The existing deployment uses Tailscale for the Windows sync machine to reach the VPS. The gateway's external Traefik URL is the canonical URL for all pairing and sync operations.

**What the pairing claim returns as gatewayUrl:** The public Traefik URL (e.g., https://sync-gateway.sanchezrepuestos.com.ar), not a Tailscale hostname. This is what the sync uses for all subsequent HTTP calls. The Tailscale layer is transparent to the application.

**Pre-flight Tailscale check:** Not included in initial implementation. The gateway does not itself depend on Tailscale — it is the sync that needs to reach the gateway. A future optional TAILSCALE_CHECK_HOST env var could be added to warn if a specific Tailscale peer is unreachable, but this is out of scope for v1.2.

---

## Sources

- Direct codebase analysis: objetiva-sync-gateway/src/routes/setup.ts (954 lines, existing setup handlers and patterns)
- Direct codebase analysis: objetiva-sync/src/store/repositories/config-repo.ts (setConfig/getConfig runtime pattern)
- Direct codebase analysis: objetiva-sync/src/config/env.ts (updateEnvFile, auto-key generation)
- Direct codebase analysis: objetiva-sync/src/api-client/index.ts (APIClientConfig, credential config pattern)
- Direct codebase analysis: objetiva-sync-gateway/docker-compose.yml (hardcoded Traefik domain, existing healthcheck structure)
- Direct codebase analysis: objetiva-sync-gateway/src/app.ts (route registration pattern, JWT setup)
- Direct codebase analysis: objetiva-sync/src/store/schema.ts (SQLite tables, no pairing table exists)
- Docker Compose startup order and healthcheck: https://docs.docker.com/compose/how-tos/startup-order/ — HIGH confidence (official Docker docs)
- OAuth 2.0 Device Code Flow pattern reference: https://developers.fattureincloud.it/docs/authentication/device-code/ — MEDIUM confidence (pairing code is analogous, not OAuth)
- Tailscale MagicDNS and mesh networking: https://tailscale.com/kb/1151/what-is-tailscale — HIGH confidence (official Tailscale docs)

---

*Architecture Research: v1.2 Setup & Pairing*
*Researched: 2026-03-04*
*Confidence: HIGH — Based on comprehensive direct codebase analysis*
