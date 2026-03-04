# Project Research Summary

**Project:** objetiva-sync-monorepo
**Domain:** Code-based service pairing, setup wizard with .env generation, Docker pre-flight validation
**Milestone:** v1.2 Setup & Pairing
**Researched:** 2026-03-04
**Confidence:** HIGH

## Executive Summary

This milestone is an installation and onboarding improvement layer on top of an already-working sync system. The core problem it solves is that operators currently must manually copy a 64-character JWT secret between a Docker container on a VPS and a Windows desktop service — an error-prone step that silently breaks authentication with no clear diagnostic. The solution is a short-lived, code-based pairing flow (6 chars, 10-minute TTL) where the gateway generates the code and the sync claims it, receiving all connection credentials in one automated exchange. This is a standard pattern (analogous to OAuth device flow, Tailscale node registration) and the entire implementation requires exactly one new npm dependency (`@fastify/rate-limit`).

The recommended approach uses only what is already in the stack: Node.js built-in `crypto` for code generation, a plain `Map` for the in-memory TTL store, `Zod` for startup env validation, and `fs/promises` for .env file generation — all already present in the codebase. The setup wizard is extended from its existing 3-step, 954-line inline-HTML form into a 6-step wizard; no new frontend framework is introduced. A TypeScript pre-flight module runs before `app.listen()` and exits the container with structured errors if any critical configuration is absent or invalid.

The key risks are all operational rather than architectural: the gateway's .env is not reflected in running memory until container recreation (not restart), Docker's `compose restart` does not re-read `env_file`, concurrent .env writes can corrupt the file, and the pairing code must not be exposed in query strings or logs. All of these risks have clear, low-cost preventions identified in the research. The pairing endpoint is the only unauthenticated new surface area and must be rate-limited from day one.

---

## Key Findings

### Recommended Stack

The v1.2 stack adds a single new npm dependency. Everything else leverages what is already installed. The gateway's existing `setup.ts` already uses `fs/promises` for .env writes, Zod is already used throughout both modules, `@fastify/jwt` handles all existing auth, and Node.js built-in `crypto.randomBytes` provides the CSPRNG needed for code generation. The decision to use a plain `Map` with `setTimeout` for the TTL store (rather than Redis or `node-cache`) is appropriate because pairing codes are ephemeral by design — container restart invalidating a pending code is acceptable behavior, not a bug.

**Core technologies:**
- `node:crypto` (built-in): Pairing code generation — CSPRNG, already available, zero new dependency
- `Map + setTimeout` (built-in): In-memory TTL store for pairing codes — matches what Fastify's own session plugin uses internally
- `@fastify/rate-limit` ^9.1.0: Rate limit on `/api/pairing/claim` — the only new dependency; official Fastify team package, Fastify 5.x compatible
- `node:fs/promises` (built-in): .env file generation — already used in `setup.ts`, no change needed
- `zod` ^3.23.8 (already installed): Startup env schema validation — consistent with existing codebase patterns
- Vanilla JS + HTML (no new framework): Wizard UI step management — existing inline setup page pattern; browser Blob API for .env download

See: [.planning/research/STACK.md](.planning/research/STACK.md)

### Expected Features

The existing codebase already has a working 4-step setup wizard, .env write capability, JWT auth, health endpoint, and Docker Compose deployment. The v1.2 feature set is additive — no existing routes are removed or replaced.

**Must have (table stakes):**
- Gateway generates short 6-char pairing code with 10-minute TTL and single-use enforcement
- Sync has "Link via code" UI: operator enters code, sync calls gateway, receives all credentials automatically
- Pre-flight validation endpoint that aggregates all readiness checks into a structured pass/fail report
- Wizard step gating: cannot advance to next step until current step's validation passes
- DB URL builder fields: separate host/port/db/user/pass fields instead of manual `postgresql://` string
- Complete `.env` preview and download at wizard completion
- Pairing code generation as the final wizard step, gated behind pre-flight passing

**Should have (competitive differentiators):**
- QR code display on gateway (operator scans instead of typing)
- Pairing expiry countdown on gateway UI
- Pairing status indicator in sync dashboard sidebar
- Re-pairing flow (replace existing link without full setup)
- `docker-compose.yml` generation from wizard (template substitution)

**Defer (v2+):**
- OAuth 2.0 device flow (RFC 8628) — overkill for one-to-one operator-owned system
- QR scanning from sync app — requires mobile or camera; wrong delivery mechanism
- Multi-gateway pairing — current config model is one-to-one by design
- Encrypted pairing payload — HTTPS transport is sufficient

See: [.planning/research/FEATURES.md](.planning/research/FEATURES.md)

### Architecture Approach

The v1.2 architecture is strictly additive: four new files, seven modified files, no schema migrations, no new database tables, no changes to the existing JWT auth flow or sync engine. The pairing code system lives entirely in `src/services/pairing.ts` (in-memory store) and `src/routes/pairing.ts` (three endpoints). The pre-flight module lives in `src/lib/preflight.ts` and is called once in `server.ts` before `app.listen()`. The setup wizard is extended in-place in the existing `routes/setup.ts` with two new steps and two new endpoints. The sync side adds one route file and UI additions to the existing `config/api.ejs` view.

**Major components:**
1. **Pairing Code Service** (`gateway/src/services/pairing.ts`) — In-memory Map with lazy TTL cleanup; 6-char alphanumeric code using unambiguous charset (no 0/O/1/I/l); single-use enforcement via `claimed` flag
2. **Pairing Routes** (`gateway/src/routes/pairing.ts`) — Three endpoints: `POST /api/pairing/generate` (JWT-authenticated), `POST /api/pairing/claim` (unauthenticated, rate-limited), `GET /api/pairing/status` (JWT-authenticated)
3. **Sync Pairing Client** (`sync/src/dashboard/routes/api/pairing.ts`) — Submits code to gateway, stores result in SQLite config table using existing `setConfig()` with encryption; no sync restart required
4. **Pre-Flight Validator** (`gateway/src/lib/preflight.ts`) — Synchronous startup gate; 5 ordered checks (env-required, env-format, postgres-connect, postgres-tables, jwt-strength); structured pino log output; `process.exit(1)` on critical failure
5. **Extended Setup Wizard** (modified `gateway/src/routes/setup.ts`) — Adds step 2 (Traefik domain), step 5 (generate-env download), step 6 (pairing code display); client-side step state in localStorage; existing steps 1/3/4 unchanged

Key asymmetry: gateway config changes require container recreation to take effect; sync config (SQLite setConfig) takes effect immediately at runtime. This shapes wizard UX — every `.env` write response must include `requiresRestart: true`.

See: [.planning/research/ARCHITECTURE.md](.planning/research/ARCHITECTURE.md)

### Critical Pitfalls

1. **Pairing code brute-forceable without rate limiting** (PC-01, HIGH) — 6-char code has a finite search space; any Tailscale node can enumerate it in seconds. Apply `@fastify/rate-limit` to `/api/pairing/claim`: max 5 attempts per IP per minute; expire code after 3 failed attempts.

2. **`docker compose restart` does not re-read `env_file`** (ENV-03, HIGH) — Docker-confirmed behavior (WONTFIX). Users who run "restart the container" after .env changes get no effect. All wizard UI must show the exact command: `docker compose up -d --force-recreate sync-gateway`. Every `.env` write API response must include `requiresRestart: true`.

3. **Concurrent .env writes corrupt the file** (ENV-01, HIGH) — The existing `read → regex-replace → write` pattern is not atomic. Two simultaneous setup form submissions corrupt the file. Implement an async promise-queue mutex around all .env writes; write to `.env.tmp` then `fs.rename()` for atomic replacement.

4. **Special characters in passwords break regex replacement** (ENV-04, HIGH) — `String.replace()` interprets `$` in replacement strings as metacharacters. Confirmed exposure in current `auth.ts` line 271. Password `test$123` silently becomes `test23`. Fix with a `safeEnvReplace()` helper that escapes `$` before calling replace.

5. **Setup wizard exposed via Traefik before configuration complete** (INT-04, HIGH) — Gateway starts, Traefik routes public traffic, `/setup` is unauthenticated. Attacker can configure their own JWT secret during the setup window. Mitigation: log a one-time setup token at first startup; require it to access `/setup`.

6. **Pairing code lost on container restart** (PC-02, HIGH) — In-memory token disappears if the container restarts during the pairing window. The `restart: unless-stopped` policy in docker-compose.yml makes this plausible. Persist the active pairing token to a file or into `.env` as `PAIRING_TOKEN=` / `PAIRING_EXPIRES=`; delete on successful claim.

7. **Pre-flight passes with default placeholder secrets** (INT-05, HIGH) — Pre-flight must check semantic validity (JWT_SECRET is not the default value, SYNC_PASSWORD is not `change-me`) as blocking checks, not just format checks. "All checks pass" with placeholder values is a security regression.

See: [.planning/research/PITFALLS.md](.planning/research/PITFALLS.md)

---

## Implications for Roadmap

The architecture research explicitly defines a 4-phase build order based on component dependencies. This order is correct and should be followed directly.

### Phase 1: Pre-Flight Validator

**Rationale:** Independent of all other new features. Touches only `server.ts` and a new `lib/preflight.ts`. Zero risk of breaking existing functionality. Delivers immediate value (structured startup errors replace cryptic crashes). Can be validated in isolation before touching any user-facing routes.

**Delivers:** Container startup validation module; structured pino log output for each check; `process.exit(1)` on critical failure; warning-only for jwt-strength; placeholder value detection as a blocking check.

**Addresses:** Startup env validation (table stakes), DB connectivity check, table existence check, placeholder secret detection.

**Avoids:** INT-05 (pre-flight passing with default secrets), PF-03 (show migration command when tables missing, not hard block), PF-01 (add "pending config" mode that validates .env file values rather than running process.env, for use in wizard context).

**Research flag:** Standard patterns — no research-phase needed. Zod env validation and raw pg connectivity check are well-documented and follow existing codebase conventions.

---

### Phase 2: Setup Wizard Enhancement

**Rationale:** Gateway must be fully configurable before pairing codes make sense. Adding the Traefik domain step (new `TRAEFIK_DOMAIN` env var) and the generate-env endpoint are prerequisites for pairing — the operator needs a running, fully-configured gateway before generating a code. This phase is gateway-only with no sync-side dependencies.

**Delivers:** Step 2 (Traefik domain configuration); Step 5 (.env generation with browser download); updated `docker-compose.yml` using `${TRAEFIK_DOMAIN}` instead of hardcoded domain; wizard step gating (cannot advance without passing current step's validation); DB URL builder widget.

**Uses:** `fs/promises` (existing), vanilla JS Blob API for browser download, `navigator.clipboard` for copy-to-clipboard.

**Avoids:** ENV-01 (async mutex on all .env writes), ENV-02 (requiresRestart in every .env write response), ENV-03 (exact `docker compose up --force-recreate` command in UI with copy button), ENV-04 (safeEnvReplace helper), ENV-05 (absolute path from module, not CWD), XC-01 (backup before write + single-write strategy for complete .env generation).

**Research flag:** No research-phase needed — all patterns established; existing codebase provides the model.

---

### Phase 3a: Gateway Pairing Routes

**Rationale:** Depends on Phase 2 (gateway must be configured before generating pairing codes). Does not depend on sync changes. Establishes the backend contract that Phase 3b will consume.

**Delivers:** `services/pairing.ts` (in-memory store with TTL); `routes/pairing.ts` (`/generate`, `/claim`, `/status` endpoints); rate limiting on `/claim` via `@fastify/rate-limit`; pairing code display in wizard step 6; `GATEWAY_PAIRED` flag set after successful claim.

**Implements:** Pairing Code Service component and Pairing Routes component from architecture.

**Avoids:** PC-01 (rate limit from day one), PC-02 (persist token to file), PC-03 (GATEWAY_PAIRED flag blocks /generate after pairing), PC-04 (no claim response body in logs — explicit redaction), INT-02 (claim completes before container restart — decouple claim from restart; it is a manual step), INT-04 (setup token for wizard access during unpairedwindow).

**Research flag:** No research-phase needed — in-memory TTL store and rate limiting are standard patterns with clear prior art.

---

### Phase 3b: Sync Pairing Client UI

**Rationale:** Depends on Phase 3a (gateway claim endpoint must exist). Sync-side changes are isolated to the dashboard: one new route file and additions to the existing `config/api.ejs` view. Minimal risk.

**Delivers:** `dashboard/routes/api/pairing.ts` (submit + status endpoints); "Conectar Gateway" section in `config/api.ejs`; successful pairing stores all credentials to SQLite config using existing `setConfig()` with encryption; automatic connection test after successful claim.

**Implements:** Sync Pairing Client component from architecture.

**Avoids:** INT-03 (Windows service CWD issue — use SQLite config table, not .env write, for pairing results on sync side; setConfig takes effect immediately without restart).

**Research flag:** No research-phase needed — follows existing `setConfig()` encrypted storage patterns already in production.

---

### Phase Ordering Rationale

- Pre-flight first because it is zero-dependency and delivers immediate value with minimal risk
- Setup wizard second because `TRAEFIK_DOMAIN` and generate-env are prerequisites for a properly-configured gateway, which is a prerequisite for pairing
- Gateway pairing routes third because the backend contract must exist before the client can be built
- Sync pairing client last because it depends on the gateway endpoint and is the most user-visible change

Each phase can be shipped and tested in isolation. If Phase 2 is delayed, Phase 1 still ships value. If Phase 3a is delayed, Phase 2 still ships value. Phases 3a and 3b are the only pair that must be coordinated.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1 (Pre-Flight):** Zod env validation and raw pg connectivity checks are well-documented. Pino logger already in use.
- **Phase 2 (Wizard Enhancement):** `fs/promises` .env writing already in codebase. Browser Blob download is MDN-documented.
- **Phase 3a (Gateway Pairing):** In-memory TTL Map and `@fastify/rate-limit` are first-party or built-in patterns with official documentation.
- **Phase 3b (Sync Pairing Client):** Follows existing `setConfig()`/`getConfig()` SQLite patterns already in production.

No phases require a `/gsd:research-phase` invocation. All decisions are based on direct codebase analysis and official documentation.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new dependency; all other decisions based on existing codebase patterns and official Node.js/Fastify docs |
| Features | HIGH | Based on direct codebase analysis of existing routes; clear MVP vs. stretch goal separation with rationale for each |
| Architecture | HIGH | Based on comprehensive codebase analysis of actual file structure, existing patterns, and verified integration points; new files named specifically |
| Pitfalls | HIGH | ENV-01 through ENV-05 confirmed in codebase (auth.ts line 271 confirmed ENV-04); ENV-03 confirmed via Docker docs WONTFIX issue; PC-01 through PC-04 verified against ecosystem patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Pairing token persistence strategy** (PC-02): Research recommends persisting to file or writing to .env as `PAIRING_TOKEN=`. The exact strategy (separate `/app/data/pairing.json` vs. into `.env` itself) should be decided in Phase 3a planning. The .env approach is simpler but mixes ephemeral state with config.

- **Setup wizard access token** (INT-04): Research identifies the exposure window but the mitigation options (log-only token vs. Traefik IP restriction middleware) have different tradeoffs. This decision point should be addressed explicitly in Phase 2 planning before implementation.

- **Pre-flight "pending config" mode** (PF-01): Pre-flight has two conceptually different modes — validating running `process.env` vs. validating `.env` file values for post-restart. The wizard should use the pending mode. Implementation detail for Phase 1 planning.

- **Windows service .env path** (INT-03): Sync uses `dotenv` with `process.cwd()`. If the Windows service sets a different CWD, env vars silently miss. The fix (`--env-file` flag or explicit path in `dotenv.config()`) is straightforward but the Windows service installation instructions must be updated accordingly.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `objetiva-sync-gateway/src/routes/setup.ts` (954 lines) — existing .env write patterns, wizard structure
- Direct codebase analysis: `objetiva-sync-gateway/src/routes/auth.ts` — confirmed ENV-04 exposure at line 271
- Direct codebase analysis: `objetiva-sync/src/store/repositories/config-repo.ts` — setConfig/getConfig runtime patterns
- Direct codebase analysis: `objetiva-sync/src/config/env.ts` — updateEnvFile pattern
- Direct codebase analysis: `objetiva-sync-gateway/docker-compose.yml` — restart policy, healthcheck, Traefik labels
- [Node.js crypto.randomBytes](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback) — official Node.js docs
- [@fastify/rate-limit GitHub](https://github.com/fastify/fastify-rate-limit) — official Fastify team package
- [Docker Compose restart docs](https://docs.docker.com/reference/cli/docker/compose/restart/) — confirmed ENV-03 behavior
- [Docker Compose up --force-recreate docs](https://docs.docker.com/reference/cli/docker/compose/up/) — confirmed correct command for env_file reloading
- [Zod docs](https://zod.dev/) — env validation patterns
- [MDN Blob API](https://developer.mozilla.org/en-US/docs/Web/API/Blob) — client-side .env download

### Secondary (MEDIUM confidence)
- OAuth 2.0 Device Authorization Grant (RFC 8628) — pairing code pattern reference (not full implementation)
- [Docker Compose GitHub issue #4140](https://github.com/docker/compose/issues/4140) — env_file reload behavior, closed WONTFIX
- Tailscale MagicDNS docs — Tailscale overlay topology context

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
