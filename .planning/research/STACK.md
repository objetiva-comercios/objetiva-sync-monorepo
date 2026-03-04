# Technology Stack

**Project:** objetiva-sync-monorepo
**Milestone:** v1.2 Setup & Pairing
**Researched:** 2026-03-04
**Focus:** Pairing code exchange, setup wizard with .env generation, Docker pre-flight validation

---

## Context

This file covers NEW stack decisions for v1.2 only. The following are validated and unchanged from prior milestones — do not re-research:

| Technology | Version | Location | Status |
|------------|---------|----------|--------|
| TypeScript | 5.7.2 | Both modules | Validated |
| Fastify | 5.7.4 | Both modules | Validated |
| Prisma ORM | 6.19.2 | Gateway | Validated |
| Drizzle ORM | 0.36.4 | Sync | Validated |
| `@fastify/jwt` | 10.0.0 | Both modules | Validated |
| Zod | 3.23.8 | Both modules | Validated |
| Node.js `fs/promises` | built-in | Both modules | Validated (used in existing setup.ts) |
| HTMX + EJS | existing | Sync dashboard | Validated |

---

## Recommended Stack for v1.2

### Feature 1: Pairing Code Exchange

**What it is:** Gateway generates a short-lived alphanumeric code (~8 chars, 5-10 minute TTL). The sync operator enters it in the sync dashboard. Sync calls a gateway endpoint with the code and receives back a set of credentials (JWT secret, gateway URL, username/password). Both sides are then configured.

**Key insight:** No pairing library is needed. The entire pairing flow is three things:
1. Secure short code generation — Node.js built-in `crypto`
2. Short-lived in-memory store with TTL — a plain `Map` with `setTimeout` cleanup or a tiny `node-cache` instance
3. One new Fastify route on the gateway that validates the code and returns credentials

#### 1a. Code Generation

**Recommendation: Node.js built-in `crypto` module — zero new dependencies**

```typescript
import { randomBytes } from 'crypto';

function generatePairingCode(): string {
  // 4 bytes = 8 hex chars — short, unambiguous, human-transcribable
  return randomBytes(4).toString('hex').toUpperCase(); // e.g. "A3F8C21D"
}
```

`crypto.randomBytes()` is cryptographically secure (CSPRNG). 8 uppercase hex characters give 4.3 billion combinations — sufficient to prevent brute-force within a 5-minute TTL window on a non-public endpoint.

**Why not a library:**
- `otp-generator`, `otplib`, `otpauth` are for TOTP/HOTP (time-based OTP with shared secrets) — designed for user login, not service pairing. Wrong abstraction.
- `crypto-random-string` is a thin wrapper over `crypto.randomBytes` with no meaningful advantage.
- `uuid` generates 36-char strings — too long to transcribe manually.

#### 1b. TTL Store (In-Memory)

**Recommendation: Plain `Map` with `setTimeout` — zero new dependencies**

The gateway already runs as a single-process Docker container (PM2 fork mode). A simple in-memory Map is sufficient:

```typescript
interface PairingEntry {
  code: string;
  gatewayUrl: string;
  jwtSecret: string;
  username: string;
  password: string;
  expiresAt: number;
}

const pairingCodes = new Map<string, PairingEntry>();

function storePairingCode(entry: PairingEntry, ttlMs = 5 * 60 * 1000): void {
  pairingCodes.set(entry.code, entry);
  setTimeout(() => pairingCodes.delete(entry.code), ttlMs);
}

function consumePairingCode(code: string): PairingEntry | null {
  const entry = pairingCodes.get(code);
  if (!entry || Date.now() > entry.expiresAt) {
    pairingCodes.delete(code);
    return null;
  }
  pairingCodes.delete(code); // one-time use
  return entry;
}
```

**Why not Redis or node-cache:**
- Redis adds a new service dependency — overkill for a single-instance gateway
- `node-cache` adds a package for what is 10 lines of native code
- Gateway restarts are fine: pairing codes are ephemeral by design, not persisted

**Confidence: HIGH** — This pattern is used in production by Fastify session plugins themselves (the default `@fastify/session` store is in-memory Map).

#### 1c. Pairing API Routes

No new libraries needed. New Fastify routes in gateway:

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/pairing/generate` | POST | Session/JWT | Generate code, return it for display |
| `/api/pairing/exchange` | POST | None (code is the auth) | Sync calls this with code, receives credentials |

The exchange endpoint must be rate-limited. The gateway already has no rate limiting — add `@fastify/rate-limit` specifically for this endpoint.

**Recommendation: `@fastify/rate-limit` ^9.1.0**

| Library | Version | Purpose | Module |
|---------|---------|---------|--------|
| `@fastify/rate-limit` | ^9.1.0 | Rate limit `/api/pairing/exchange` | Gateway only |

```bash
# Gateway
npm install @fastify/rate-limit
```

The exchange endpoint should allow max 5 attempts per IP per 10 minutes to prevent brute-force against active pairing codes.

**Confidence: HIGH** — `@fastify/rate-limit` is official Fastify team package, well-documented, works with Fastify 5.x.

---

### Feature 2: Setup Wizard with .env Generation

**What it is:** Rework the existing `/setup` page in the gateway from a 4-step form into a multi-step wizard. New capability: the wizard generates a complete `.env` file that can be downloaded or copied, rather than just patching individual variables into an existing `.env`.

**Key insight:** The existing `setup.ts` already uses `fs/promises` to read and patch `.env` directly. That pattern continues. The new need is:
1. Collecting all variables across wizard steps in one pass
2. Generating the complete `.env` content as a formatted string
3. Offering download + clipboard copy in the browser

#### 2a. .env File Writing

**Recommendation: Node.js built-in `fs/promises` — zero new dependencies**

The existing gateway `setup.ts` already does:
```typescript
import fs from 'fs/promises';
const envContent = await fs.readFile(envPath, 'utf-8');
await fs.writeFile(envPath, newContent, 'utf-8');
```

This pattern is correct and sufficient. The v1.2 wizard extends it by generating the complete file from a template string rather than patching line by line.

**Why not dotenv-flow or dotenv-safe:**
- These are for reading `.env` files, not writing them
- Writing is pure string manipulation + `fs.writeFile` — no library adds value
- `dotenv` itself has no `writeFile` API

**Template generation pattern:**
```typescript
function generateEnvContent(params: SetupParams): string {
  return [
    `# Objetiva Sync Gateway - Generated ${new Date().toISOString()}`,
    `PORT=${params.port}`,
    `NODE_ENV=production`,
    `HOST=0.0.0.0`,
    ``,
    `# Database`,
    `DATABASE_URL="${params.databaseUrl}"`,
    ``,
    `# Authentication`,
    `JWT_SECRET=${params.jwtSecret}`,
    `SYNC_USERNAME=${params.username}`,
    `SYNC_PASSWORD=${params.password}`,
    ``,
    `# Traefik`,
    `TRAEFIK_DOMAIN=${params.domain}`,
    ``,
    `APP_NAME=Objetiva Sync Gateway`,
  ].join('\n');
}
```

**Confidence: HIGH** — Already used in codebase, no new dependency.

#### 2b. Wizard UI (Browser Side)

**Recommendation: Plain HTML + vanilla JS — no new frontend dependency**

The existing setup page is already inline HTML+CSS+JS served by Fastify. The wizard steps are shown/hidden via CSS (`display: none` / `display: block`). The browser's built-in `navigator.clipboard.writeText()` handles copy-to-clipboard. The `<a download>` attribute handles file download.

**Why not Alpine.js, htmx, or React:**
- Alpine.js adds a JS framework dependency just for wizard step visibility — overkill
- HTMX is for server-round-trips — wizard state is all client-side
- React is not on the gateway server (only in the dashboard sub-package which is a separate build)
- Vanilla JS `currentStep++` and `document.querySelectorAll('.step')` is 10 lines

**Download pattern (browser):**
```javascript
function downloadEnv(content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '.env';
  a.click();
  URL.revokeObjectURL(url);
}
```

**Confidence: HIGH** — `Blob`, `URL.createObjectURL`, `<a download>`, and `navigator.clipboard` are supported in all modern browsers (Chrome 86+, Firefox 82+, Safari 13.1+).

---

### Feature 3: Docker Pre-Flight Validation

**What it is:** Before the gateway Docker container is considered healthy, validate that all required environment variables are set and the database connection is reachable. Expose this as both a startup check (fails fast with clear error) and a checklist UI in the setup wizard.

**Key insight:** Two distinct layers:
1. **Startup validation** — synchronous check at boot before registering routes, exits if invalid
2. **Setup wizard checklist** — browser polls `/api/setup/preflight` to show green/red status per parameter

#### 3a. Startup Validation

**Recommendation: Zod schema validation on `process.env` — already in stack**

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3335'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  SYNC_USERNAME: z.string().min(1),
  SYNC_PASSWORD: z.string().min(6),
});

const env = EnvSchema.safeParse(process.env);
if (!env.success) {
  console.error('Invalid environment configuration:');
  env.error.issues.forEach(issue => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}
```

This provides per-variable error messages at startup. No library needed — Zod is already in the stack.

**Why not `envalid` or `env-var`:**
- These are popular env validation libraries
- Zod already used throughout the codebase for schema validation
- Adding a second validation library creates inconsistency
- Zod provides identical functionality with better TypeScript integration

**Confidence: HIGH** — Zod is already used in both modules.

#### 3b. Pre-Flight API Endpoint

**Recommendation: New Fastify route `/api/setup/preflight` — no new dependencies**

Returns a structured checklist:

```json
{
  "checks": {
    "env_database_url": { "ok": true, "message": "Set" },
    "env_jwt_secret": { "ok": true, "message": "32+ chars" },
    "env_credentials": { "ok": false, "message": "SYNC_PASSWORD is default value" },
    "db_connection": { "ok": true, "message": "Connected (2ms)" },
    "db_tables": { "ok": true, "message": "4/4 required tables exist" }
  },
  "ready": false
}
```

The setup wizard polls this endpoint and renders a visual checklist. Implementation uses existing Prisma for DB check + `process.env` inspection.

#### 3c. Docker Healthcheck

**Recommendation: Existing `/health` endpoint + Node.js inline script — no new dependencies**

The gateway already has `/health` endpoint (implemented in v1.1-rc2). The docker-compose already uses it:

```yaml
healthcheck:
  test: ["CMD", "node", "-e",
    "fetch('http://localhost:3335/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"]
  interval: 30s
  timeout: 5s
  start_period: 10s
  retries: 3
```

This is sufficient. The pre-flight validation complements this by providing human-readable status in the wizard, not by replacing the Docker healthcheck.

**Confidence: HIGH** — Pattern already implemented and working in the codebase.

---

## Complete Additions for v1.2

| Library | Version | Purpose | Module | New? |
|---------|---------|---------|--------|------|
| `@fastify/rate-limit` | ^9.1.0 | Rate limit pairing exchange endpoint | Gateway | YES |
| `node:crypto` | built-in | Pairing code generation | Gateway | No (built-in) |
| `node:fs/promises` | built-in | .env file write/read | Gateway | No (already used) |
| `zod` | ^3.23.8 | Env startup validation | Gateway | No (already installed) |

**Total new npm dependencies: 1** (`@fastify/rate-limit`)

---

## Installation

```bash
# Gateway only
cd objetiva-sync-gateway
npm install @fastify/rate-limit
```

No changes to `objetiva-sync` (sync module) package.json.

---

## What NOT to Add

| Library | Why Not |
|---------|---------|
| `otplib` / `otp-generator` | TOTP/HOTP for user login — wrong abstraction for service pairing |
| `node-cache` | 10 lines of Map+setTimeout replaces it without adding a dependency |
| Redis | Single-instance container, no multi-process — overkill for ephemeral codes |
| `dotenv-flow` / `dotenv-safe` | These read .env, not write it. Writing is fs.writeFile + template string |
| `envalid` / `env-var` | Zod already in stack and provides identical env validation |
| Alpine.js / htmx (for wizard) | Vanilla JS is sufficient for step visibility + form collection |
| `@fastify/multipart` | No file uploads in wizard — .env download is client-side Blob |
| `jsonwebtoken` | Gateway already uses `@fastify/jwt` — do not duplicate JWT handling |

---

## Integration Points

### Pairing Flow Integration

```
Gateway (VPS/Docker)                    Sync (Windows)
─────────────────────                   ──────────────
/setup wizard (step 5)
  → POST /api/pairing/generate
  ← { code: "A3F8C21D", expiresIn: 300 }

  Operator reads code on screen
  Operator types code into sync dashboard

                                        POST /api/pairing/exchange
                                          { code: "A3F8C21D" }
                                        ← { jwtSecret, username, password, gatewayUrl }

                                        Sync writes to its own SQLite config
                                        Sync auto-configures itself
```

### .env Generation Integration

```
Gateway /setup wizard                   Gateway filesystem
─────────────────────                   ──────────────────
Step 1: PostgreSQL URL → validated
Step 2: JWT secret → generated/entered
Step 3: Admin password → entered
Step 4: Traefik domain → entered
Step 5: Preview complete .env

[Download .env] → client Blob download → user uploads to VPS
[Save to disk]  → POST /api/setup/save-env → fs.writeFile(.env)
[Generate code] → POST /api/pairing/generate → { code, expiresIn }
```

### Drizzle Migration for Sync Side

The sync module stores gateway credentials in its SQLite `config` table (key-value store with AES-256-GCM encryption, already implemented). No schema migration needed — pairing result is stored as encrypted config values using the existing `config` table pattern:

```
config: { key: 'gateway.url', value: '<encrypted>', encrypted: true }
config: { key: 'gateway.jwtSecret', value: '<encrypted>', encrypted: true }
config: { key: 'gateway.username', value: 'admin', encrypted: false }
config: { key: 'gateway.password', value: '<encrypted>', encrypted: true }
```

This reuses the existing `config-repo.ts` encrypted storage pattern — no new code structure needed.

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| Pairing code generation (`crypto`) | HIGH | Built-in Node.js, CSPRNG, already used in codebase |
| In-memory TTL store (Map) | HIGH | Sufficient for single-instance; matches session plugin internals |
| `@fastify/rate-limit` | HIGH | Official Fastify package, same team, Fastify 5.x compatible |
| .env generation (fs/promises) | HIGH | Already used in existing setup.ts |
| Env startup validation (Zod) | HIGH | Already installed, same validation patterns used throughout |
| Docker healthcheck (existing /health) | HIGH | Already implemented and working |
| Wizard UI (vanilla JS) | HIGH | No framework needed, browser APIs sufficient |

---

## Sources

- [Node.js crypto.randomBytes documentation](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback) — official Node.js docs
- [@fastify/rate-limit GitHub](https://github.com/fastify/fastify-rate-limit) — official Fastify team
- [Fastify Ecosystem](https://fastify.dev/ecosystem/) — verified package compatibility
- [Zod docs](https://zod.dev/) — env validation patterns
- [MDN Blob API](https://developer.mozilla.org/en-US/docs/Web/API/Blob) — client-side download
- [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) — copy to clipboard

---

## Previous Milestone Research (Preserved for Reference)

For v1.1-rc2 stack decisions (PostgreSQL adapter, shadcn/ui, OpenTelemetry, auth), see git history.
The following remain valid and unchanged:
- `pg` ^8.18.0 in sync module for PostgreSQL source adapter
- `@fastify/otel` for observability (if implemented)
- `radix-ui` ^1.4.3 for gateway dashboard (if dashboard modernization proceeds)

---

*Researched: 2026-03-04 (v1.2 Setup & Pairing milestone)*
*Previous research: 2026-02-11 (v1.1-rc2)*
