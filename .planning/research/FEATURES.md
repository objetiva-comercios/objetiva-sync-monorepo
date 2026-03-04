# Feature Landscape: v1.2 Setup & Pairing

**Domain:** Code-based service pairing, setup wizard with .env generation, Docker pre-flight validation
**Researched:** 2026-03-04
**Overall Confidence:** HIGH

---

## Context: What Already Exists

Before classifying features, what the codebase already has is important. These are **not** things to build.

| Already Built | Location | Status |
|---------------|----------|--------|
| Gateway `/setup` page (4-step wizard: DB, JWT, tables, credentials) | `objetiva-sync-gateway/src/routes/setup.ts` | Working, 954 lines |
| Wizard writes to `.env` file at runtime | `setup.ts` POST handlers | Working |
| Sync dashboard `/config/api` page (URL + username + password) | `objetiva-sync/src/dashboard/views/config/api.ejs` | Working |
| JWT auth login/refresh between sync and gateway | `auth.ts`, `AuthManager` | Working |
| Health check endpoint `/health` | `health.ts` | Working |
| Auth diagnostics endpoint `/api/auth/diagnostics` | `auth.ts` | Working |
| Docker Compose with Traefik labels | `docker-compose.yml` | Working |
| `.env.example` files for both modules | Root of each module | Working |
| Docker entrypoint runs Prisma migrations | `docker-entrypoint.sh` | Working |

---

## Table Stakes

Features that users of this system will expect. Missing any of these means the pairing/setup experience is incomplete.

### Pairing Code System

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| **Gateway generates short pairing code** | Standard pattern (OAuth device flow, Tailscale, Vercel CLI) — user expects a code to copy, not manual credential entry | Low | None — new endpoint `/api/pairing/generate` |
| **Code is short and human-typeable** | 6-8 alphanumeric chars (e.g. `A3K9-FP2`) avoids typos; pure UUID is too long for manual entry | Low | `crypto.randomBytes` already in gateway |
| **Code expires after a time window** | Codes that live forever are a security risk; 10-30 minutes is standard for setup workflows | Low | In-memory map with timestamp; no DB changes needed |
| **Code is single-use** | After sync consumes the code, it must be invalidated; prevents replay | Low | Same in-memory map, delete after claim |
| **Code encodes all connection parameters** | Gateway URL, username, password, JWT secret — sync reads one code and gets everything it needs; no manual credential entry | Medium | Requires gateway to know its own public URL (env var `GATEWAY_PUBLIC_URL`) |
| **Sync has a "Link via code" UI** | Input field in `/config/api` page; user types code, sync calls gateway to claim it | Low | Existing api.ejs form; add one field + button |
| **Sync claims code from gateway API** | `POST /api/pairing/claim` with the code; gateway returns credentials; sync saves them to SQLite + .env | Medium | Existing `REMOTE_API_URL` / `REMOTE_API_USERNAME` / `REMOTE_API_PASSWORD` in sync store |
| **Pairing status confirmation** | After claiming, sync shows "Linked to [gateway URL]" with green indicator and tests connection | Low | Existing connection test pattern in api.ejs |
| **Code display is prominent on gateway UI** | Code shown in `/setup` or a new `/pairing` page, large and easy to read | Low | Existing setup page HTML |

### Improved Gateway Setup Wizard

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| **Wizard knows when Docker is the deployment context** | Docker vs bare-metal changes which validations matter; wizard must not try to ping `localhost` when DB is in a container | Low | Read `DOCKER_CONTEXT` or similar env var |
| **DB URL field with builder UI** | Instead of typing `postgresql://user:pass@host:5432/db`, have host/port/db/user/pass fields that assemble the URL | Low | Existing `databaseUrl` field in setup step 1 |
| **JWT secret generation button** | "Generate" button creates a `crypto.randomBytes(32).toString('hex')` value and fills the field | Low | `crypto` already imported in gateway |
| **Show the complete generated .env** | After completing wizard, show a copyable text block of the full `.env` content for review | Low | Wizard already writes to .env; just render current state |
| **Wizard can be re-run** | If configuration changes, user should be able to redo the wizard without restarting | Low | Current wizard routes are always accessible |
| **Wizard validates each step before advancing** | Step 1 (DB): test connection. Step 2 (JWT): validate format. Step 3 (tables): verify tables exist. Step 4 (credentials): save and test login | Low | All step validation logic already exists; UI step-gating is missing |
| **Step state persists across page refresh** | If user refreshes mid-wizard, completed steps should remain checked | Low | Load from `/api/setup/status` on page load; already exists |

### Docker Pre-Flight Validation

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| **Pre-flight checklist page or section** | Users deploying Docker need confidence that all required vars are set before `docker-compose up` | Low | New page or section in setup wizard |
| **Validate all required env vars are set** | Check `DATABASE_URL`, `JWT_SECRET`, `SYNC_USERNAME`, `SYNC_PASSWORD` are not placeholder values | Low | Existing `/api/setup/status` logic already detects placeholder values |
| **Validate DATABASE_URL format for Docker** | Catch the common mistake of using `localhost` instead of container name in Docker context | Low | Parse URL, check hostname against known pitfall list |
| **Test actual DB connection** | Button that tests live connection to PostgreSQL with the current `DATABASE_URL` | Low | `POST /api/setup/test-db` already exists |
| **Verify Prisma tables exist** | Tables must exist before accepting sync data | Low | `POST /api/setup/verify-tables` already exists |
| **Show external URL/domain configured** | Confirm `GATEWAY_PUBLIC_URL` or Traefik hostname is set; needed for pairing code | Low | New env var check |
| **Pre-flight generates a readiness report** | Show pass/fail for each check with clear remediation text | Low | New endpoint `GET /api/setup/preflight` aggregating all checks |
| **Pairing code available only after pre-flight passes** | Prevents issuing pairing codes before the gateway is properly configured | Low | Guard on `/api/pairing/generate` |

---

## Differentiators

Features that go beyond expectations and significantly improve the install experience. Worth building if time allows.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Pairing code shown as QR code** | Scan from phone instead of typing; Tailscale does this | Low | `qrcode` npm package; optional enhancement |
| **Wizard generates complete docker-compose.yml** | Fill in subdomain + DB password, download ready-to-use compose file | Medium | Template substitution; prevents docker-compose editing mistakes |
| **Wizard generates complete .env for docker-compose** | Download button on last step generates a properly formatted `.env`; user does not need to edit text file | Low | Render current state of all vars as text/plain download |
| **Sync shows pairing status in dashboard sidebar** | Persistent indicator showing "Gateway: Connected" or "Not linked" | Low | Use existing connection state |
| **Gateway shows last paired sync timestamp** | "Last synced from: [IP] at [time]" in dashboard | Low | Already trackable from request headers |
| **Re-pairing flow (replace existing link)** | If sync is already linked, "Re-link" option invalidates old link and starts new pairing | Low | Same pairing flow with a "force" flag |
| **Pairing code with expiry countdown** | Show "Expires in 12:34" on gateway, auto-expire with visual feedback | Low | JS countdown using expiry timestamp from API response |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **OAuth 2.0 device flow (full RFC 8628)** | Overkill — no authorization server, no scopes, no refresh tokens needed; the goal is linking two systems owned by one operator | Simple short-lived code with a claim endpoint |
| **QR code scanning from sync app** | Sync runs on Windows with a web dashboard; QR scanning requires mobile app or camera integration — wrong delivery mechanism | Manual code entry with optional QR display on gateway side only |
| **Encrypted pairing payload (full envelope encryption)** | Pairing happens over HTTPS (Tailscale or Traefik TLS); double-encrypting the code adds complexity without security gain | HTTPS is sufficient transport security |
| **Multi-gateway pairing (one sync to N gateways)** | Current architecture is one sync to one gateway; the config model is not built for multiple remotes | Keep one-to-one; document as intended constraint |
| **Pairing code persistence in database** | Codes are short-lived (10-30 min); storing in DB adds migration complexity; in-memory with process restart handling is enough | In-memory map; document that restarting gateway invalidates pending codes |
| **Wizard with real-time Prisma migration execution** | Running `prisma migrate deploy` from the wizard UI is dangerous in production; it is already handled by `docker-entrypoint.sh` | Pre-flight check verifies tables exist; if missing, show instruction to restart container |
| **Docker Compose orchestration from the wizard** | The wizard should never run `docker-compose` commands; it validates state, not drives deployment | Pre-flight validates; user runs docker commands manually |
| **Automatic JWT secret sync between systems** | Sync and gateway are on different servers; auto-sync requires an initial trust relationship (chicken-and-egg problem) | Pairing code embeds the JWT secret so it is shared in one step |

---

## Feature Dependencies

```
Pre-flight validation
    |
    +-- All required env vars set (validate before pairing)
    |       (existing /api/setup/status detects placeholders)
    |
    +-- DB connection live (existing /api/setup/test-db)
    |
    +-- Tables exist (existing /api/setup/verify-tables)
    |
    +-- GATEWAY_PUBLIC_URL configured (new check)

Pairing code generation
    |
    +-- Pre-flight must pass (guard: no code if misconfigured)
    |
    +-- GATEWAY_PUBLIC_URL known (code must embed it)
    |
    +-- JWT_SECRET set (code must embed it for sync to use)

Pairing code claim (sync side)
    |
    +-- Sync calls gateway POST /api/pairing/claim with code
    |
    +-- Gateway returns: url, username, password, jwt_secret
    |
    +-- Sync saves to SQLite (existing store) + .env (existing updateEnvFile pattern)
    |
    +-- Connection test runs automatically after save

Improved wizard
    |
    +-- Step gating (cannot advance without passing validation) -- new UI behavior only
    |
    +-- DB URL builder -- new UI widget, no backend changes needed
    |
    +-- Generate .env button -- renders current env state, no new backend logic
    |
    +-- Pairing code section is the final step AFTER all other steps pass
```

---

## MVP Recommendation

**Critical path for v1.2:**

1. **Pre-flight validation endpoint** (`GET /api/setup/preflight`) — aggregates all existing checks plus new `GATEWAY_PUBLIC_URL` check. Single source of truth for "is gateway ready?" All logic already exists; this is wiring.

2. **Pairing code generate/claim endpoints** — gateway generates code, sync claims it. Core value of the milestone. Build backend first, then UI. Two endpoints: `POST /api/pairing/generate` and `POST /api/pairing/claim`.

3. **"Link via code" UI on sync** — one new field + button in existing `/config/api` view. Minimal UI change, maximum UX improvement.

4. **Wizard step gating** — existing wizard already has all validation logic; just prevent advancing if current step has not passed. Pure frontend change, no new backend endpoints needed.

5. **DB URL builder fields** — UX improvement for step 1 of wizard. Low complexity, high user value for Docker deployments where host is a container name, not `localhost`.

**Defer to stretch goals:**

- QR code display (nice-to-have, 1-2 hours, but not blocking)
- docker-compose.yml generation (medium effort, solves real pain, not MVP)
- Pairing status in sync sidebar (cosmetic polish, not blocking)
- `.env` download button (useful, not critical)

---

## Sources

- OAuth 2.0 Device Authorization Grant (RFC 8628) — pattern reference for short user codes and expiry: https://datatracker.ietf.org/doc/html/rfc8628
- OAuth Device Flow code format patterns (Base 20 chars, dash-separated): https://curity.io/resources/learn/oauth-device-flow/
- Docker Compose Health Checks Practical Guide: https://www.tvaidyan.com/2025/02/13/health-checks-in-docker-compose-a-practical-guide/
- Docker Compose depends_on condition healthy: https://last9.io/blog/docker-compose-health-checks/
- Open WebUI env configuration (setup wizard .env patterns): https://docs.openwebui.com/reference/env-configuration/
- Existing codebase: `objetiva-sync-gateway/src/routes/setup.ts` (954 lines, all step validation logic)
- Existing codebase: `objetiva-sync-gateway/src/routes/auth.ts` (JWT, login, refresh patterns)
- Existing codebase: `objetiva-sync/src/dashboard/views/config/api.ejs` (current sync API config UI)
- Existing codebase: `objetiva-sync-gateway/docker-entrypoint.sh` (Prisma migration on container start)
- Existing codebase: `objetiva-sync/src/config/env.ts` (`updateEnvFile` pattern for writing to .env)

---

## Quality Gate Checklist

- [x] Categories clear: table stakes vs differentiators vs anti-features
- [x] Complexity noted for each feature (Low/Medium/High)
- [x] Dependencies on existing features identified and cross-referenced
- [x] Anti-features include "what to do instead" — not just what to avoid
- [x] MVP recommendation identifies critical path vs stretch goals

---
*Researched: 2026-03-04 | Milestone: v1.2 Setup & Pairing*
