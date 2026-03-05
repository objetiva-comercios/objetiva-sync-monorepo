# Phase 20: Gateway Pairing Routes - Research

**Researched:** 2026-03-05
**Domain:** Fastify route implementation — short-lived pairing code generation and claim
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Credential payload**
- Claim response returns 3 fields: `gatewayUrl` (GATEWAY_PUBLIC_URL), `jwtSecret` (JWT_SECRET), `syncPassword` (SYNC_PASSWORD raw plaintext)
- Sync username is implicit (fixed as 'sync') — not included in payload
- No extra metadata (no gateway version, no database URL)
- Password is raw plaintext — sync uses it to authenticate via POST /auth/login as it does today

**Wizard integration**
- New step 6 ("Link Sync Client") added after the Download step in the setup wizard
- Step 6 is gated behind GATEWAY_PUBLIC_URL — if domain was skipped in step 2, step 6 shows a message directing the operator to set it first
- Code auto-generates when operator reaches step 6 (no manual click required to get the first code)
- "Generate New Code" button available for getting a fresh code
- Wizard-only for now — no separate dashboard section for re-pairing

**Code generation rules**
- 6-character uppercase alphanumeric code
- Exclude ambiguous characters: no 0, O, I, 1 — charset is A-Z (minus O, I) + 2-9 = 32 chars
- Claim endpoint accepts case-insensitive input (normalizes to uppercase before matching)
- 10-minute TTL
- One active code at a time — generating a new code invalidates any previous active code
- In-memory Map + setTimeout for TTL store (no Redis, container restart invalidates codes which is acceptable)

**Security boundaries**
- Claim endpoint works over HTTP — Tailscale provides encrypted tunnel
- If GATEWAY_PUBLIC_URL is not set: claim returns credentials with gatewayUrl as null
- Generate endpoint (POST /api/pairing/generate) requires JWT auth
- Claim endpoint (POST /api/pairing/claim) is unauthenticated with rate limit of 5 per minute per IP
- @fastify/rate-limit already registered in app.ts with global: false — reuse for claim endpoint
- Log claim events at info level: code claimed, source IP, timestamp

### Claude's Discretion
- Exact implementation of password sourcing for claim response
- Pairing store module structure and cleanup logic
- Expiration countdown UI implementation in wizard step 6
- Error response format for expired/invalid/consumed codes
- Whether to add a visual indicator in the wizard showing "Code claimed!" when sync successfully pairs

### Deferred Ideas (OUT OF SCOPE)
- QR code display alongside text code — Future requirement PAIR-F02
- Re-pairing flow outside wizard (revoke + regenerate) — Future requirement PAIR-F02
- Multi-client pairing (multiple sync instances) — Future requirement PAIR-F03
- Dashboard section for generating codes without re-running wizard — Future enhancement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAIR-01 | Gateway generates 6-char alphanumeric pairing code with 10-minute expiration | In-memory Map + setTimeout pattern; crypto.randomBytes for generation; 32-char charset excluding ambiguous chars |
| PAIR-02 | Sync consumes code via POST /api/pairing/claim and receives URL, JWT secret, credentials | Route returns { gatewayUrl, jwtSecret, syncPassword } — all available from process.env at claim time |
| PAIR-03 | Sync stores configuration automatically (SQLite) | Gateway side: deliver correct payload; sync side is Phase 21 |
| PAIR-04 | Code invalidates immediately after first use — single-use | Delete from Map on first claim; 410 Gone on second use requires tracking consumed codes separately from active ones |
| PAIR-05 | Rate limiting on unauthenticated claim endpoint to prevent brute force | @fastify/rate-limit already registered globally with global:false — add config.rateLimit to claim route |
</phase_requirements>

---

## Summary

Phase 20 adds a pairing flow to the gateway: a short-lived 6-character code that an operator reads from the setup wizard and enters into the sync client, which then gets all connection credentials in one call. The gateway side consists of two routes (generate + claim) and a new wizard step 6.

The implementation is self-contained: no new npm packages are needed, no database schema changes, and no external dependencies. All required pieces already exist in the codebase — the `authenticate` middleware, `@fastify/rate-limit`, `writeEnvVar`, and the inline-HTML wizard pattern. The main new artifact is a `pairing-store.ts` module holding the in-memory Map and code lifecycle logic.

The critical insight on password sourcing: `SYNC_PASSWORD` is already stored as **plaintext** in `.env` (the auth system uses `crypto.timingSafeEqual` directly, not bcrypt). `writeEnvVar` also does `process.env[key] = value` in-place immediately. Therefore `process.env.SYNC_PASSWORD` is the raw plaintext at claim time — no extra work required. The claim route simply reads it from `process.env`.

**Primary recommendation:** Implement in one plan: (1) pairing-store module, (2) pairing routes file, (3) register in app.ts, (4) wizard step 6 appended to setup.ts, (5) integration tests.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.7.4 | HTTP server and route registration | Project stack |
| @fastify/rate-limit | ^10.3.0 | Per-route IP rate limiting for claim endpoint | Already registered in app.ts with global:false |
| @fastify/jwt | ^10.0.0 | JWT verification via `authenticate` middleware | Already registered; generate endpoint uses it |
| zod | ^3.23.8 | Request body validation (PairingClaimSchema) | Project standard for validation |
| Node.js crypto | built-in | Secure random code generation via `crypto.randomBytes` | No extra dependency |
| vitest | ^4.0.18 | Testing framework | Project standard |

### No New Dependencies

Zero new npm packages required. This is consistent with the STATE.md decision: "Only 1 new npm dependency (@fastify/rate-limit) — everything else uses existing stack." (@fastify/rate-limit is already installed.)

---

## Architecture Patterns

### Recommended File Structure

```
src/
├── routes/
│   ├── pairing.ts           # NEW: registerPairingRoutes() — generate + claim endpoints
│   └── setup.ts             # MODIFY: add step 6 HTML/JS and TOTAL_STEPS=6
├── lib/
│   └── pairing-store.ts     # NEW: in-memory code store with TTL management
└── app.ts                   # MODIFY: import + register pairing routes

tests/
├── unit/
│   └── pairing-store.test.ts        # NEW: unit tests for store logic
└── integration/
    └── pairing.integration.test.ts  # NEW: full route tests via app.inject()
```

### Pattern 1: In-Memory Pairing Store

**What:** A module-level singleton Map that holds exactly one active pairing code at a time, with a separate Set for consumed codes (needed for 410 vs 404 distinction).

**When to use:** This is the only approach — in-memory per STATE.md decision.

```typescript
// src/lib/pairing-store.ts

interface PairingEntry {
  code: string
  expiresAt: Date
  timeoutHandle: ReturnType<typeof setTimeout>
}

// Only one active code at a time
let activeEntry: PairingEntry | null = null

// Track consumed codes so claim returns 410 (not 404) on reuse.
// Bounded set — entries expire after TTL + small buffer to avoid unbounded growth.
const consumedCodes = new Set<string>()

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 chars: no O, I, 0, 1
const CODE_LENGTH = 6
const TTL_MS = 10 * 60 * 1000 // 10 minutes

export function generateCode(): { code: string; expiresAt: Date } {
  // Invalidate any existing active code
  if (activeEntry) {
    clearTimeout(activeEntry.timeoutHandle)
    activeEntry = null
  }

  // Generate secure random code
  const bytes = crypto.randomBytes(CODE_LENGTH)
  const code = Array.from(bytes)
    .map(b => CHARSET[b % CHARSET.length])
    .join('')

  const expiresAt = new Date(Date.now() + TTL_MS)

  const timeoutHandle = setTimeout(() => {
    if (activeEntry?.code === code) {
      activeEntry = null
    }
  }, TTL_MS)

  // Prevent Node from keeping process alive for this timer
  if (timeoutHandle.unref) timeoutHandle.unref()

  activeEntry = { code, expiresAt, timeoutHandle }
  return { code, expiresAt }
}

export function claimCode(inputCode: string): 'ok' | 'consumed' | 'invalid' {
  const normalized = inputCode.toUpperCase()

  if (consumedCodes.has(normalized)) return 'consumed'
  if (!activeEntry || activeEntry.code !== normalized) return 'invalid'
  if (activeEntry.expiresAt < new Date()) {
    activeEntry = null
    return 'invalid'
  }

  // Consume it
  clearTimeout(activeEntry.timeoutHandle)
  consumedCodes.add(normalized)
  activeEntry = null

  // Clean up consumed set after TTL window to bound memory
  setTimeout(() => consumedCodes.delete(normalized), TTL_MS + 5000).unref?.()

  return 'ok'
}

export function getActiveCode(): PairingEntry | null {
  return activeEntry
}
```

### Pattern 2: Pairing Routes — Generate Endpoint

**What:** Authenticated POST that calls `generateCode()` and returns the code + expiry.

```typescript
// src/routes/pairing.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { generateCode, claimCode } from '../lib/pairing-store.js'
import { logger } from '../lib/logger.js'

const ClaimSchema = z.object({
  code: z.string().min(1).max(10)
})

export async function registerPairingRoutes(app: FastifyInstance) {
  // POST /api/pairing/generate — authenticated, issues a new code
  app.post('/api/pairing/generate', { preHandler: [authenticate] }, async (_request, reply) => {
    const { code, expiresAt } = generateCode()
    logger.info({ code }, 'Pairing code generated')
    return reply.send({ success: true, code, expiresAt: expiresAt.toISOString() })
  })

  // POST /api/pairing/claim — unauthenticated, rate limited
  app.post(
    '/api/pairing/claim',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    },
    async (request, reply) => {
      const parseResult = ClaimSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_INPUT',
          message: 'code is required'
        })
      }

      const { code } = parseResult.data
      const result = claimCode(code)

      if (result === 'consumed') {
        logger.info({ code: code.toUpperCase(), ip: request.ip }, 'Pairing code already consumed')
        return reply.status(410).send({
          success: false,
          error: 'CODE_CONSUMED',
          message: 'Pairing code has already been used'
        })
      }

      if (result === 'invalid') {
        logger.info({ code: code.toUpperCase(), ip: request.ip }, 'Pairing code invalid or expired')
        return reply.status(404).send({
          success: false,
          error: 'CODE_INVALID',
          message: 'Pairing code not found or expired'
        })
      }

      // result === 'ok'
      logger.info({ ip: request.ip, timestamp: new Date().toISOString() }, 'Pairing code claimed successfully')

      return reply.send({
        success: true,
        gatewayUrl: process.env.GATEWAY_PUBLIC_URL || null,
        jwtSecret: process.env.JWT_SECRET || null,
        syncPassword: process.env.SYNC_PASSWORD || null
      })
    }
  )
}
```

### Pattern 3: Register in app.ts

**What:** Follow existing registration pattern — add import and register call after preflight.

```typescript
// In app.ts — add after existing imports:
import { registerPairingRoutes } from './routes/pairing.js'

// In buildApp() — add after registerPreflightRoutes:
await registerPairingRoutes(app)

// Also add /api/pairing/ to SETUP_ONLY_ALLOWLIST so claim works
// even when gateway is in setup-only mode (operator runs wizard, then claims):
const SETUP_ONLY_ALLOWLIST = ['/health', '/metrics', '/setup', '/api/setup/', '/api/pairing/claim']
```

**Note on setup-only allowlist:** The claim endpoint must be reachable when the gateway is in setup-only mode (immediately after wizard completes, before restart). The generate endpoint does NOT need to be in the allowlist since it requires JWT auth and the wizard calls it directly from the browser (which already loaded the wizard).

Actually: the wizard JS calls `POST /api/pairing/generate` from the browser. If the gateway is in setup-only mode and generate is not in the allowlist, the call will return 503. Decision: also add `/api/pairing/` prefix to the allowlist (covers both generate and claim) so the wizard flow works end-to-end without requiring a restart between completing setup and getting a pairing code.

### Pattern 4: Wizard Step 6 — HTML Structure

**What:** Appended to the existing inline HTML in setup.ts. Follows the exact same pattern as steps 0–4.

**Key elements needed:**
- Stepper: add 6th dot to `<div class="stepper">` — update TOTAL_STEPS to 6
- Step HTML div: `<div class="wizard-step" id="wizard-step-5">` (0-indexed, so step 6 is index 5)
- Code display: large monospaced font, prominently styled
- Copy button
- Countdown timer (JS `setInterval` updating every second)
- "Generate New Code" button
- Gating: check `state.stepData.domainSkipped` or fetch `/api/setup/status` to verify GATEWAY_PUBLIC_URL

**Step enter logic (called from `advanceStep()`):**

The `advanceStep()` function currently has a special case for step 4 (`loadDownloadSummary`). Extend it for step 5:

```javascript
function advanceStep() {
  state.completedSteps.add(state.currentStep);
  const next = state.currentStep + 1;
  showStep(next);
  if (next === 4) {
    loadDownloadSummary();
  }
  if (next === 5) {
    enterPairingStep();
  }
}
```

**Countdown implementation (Claude's Discretion — recommended approach):**

```javascript
let countdownInterval = null;

function startCountdown(expiresAt) {
  if (countdownInterval) clearInterval(countdownInterval);
  function tick() {
    const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const el = document.getElementById('pairing-countdown');
    if (el) {
      el.textContent = remaining > 0
        ? 'Expires in ' + mins + ':' + secs.toString().padStart(2, '0')
        : 'Code expired — click Generate New Code';
    }
    if (remaining === 0) clearInterval(countdownInterval);
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}
```

**Domain gating logic:**

```javascript
async function enterPairingStep() {
  const gatingEl = document.getElementById('pairing-no-domain-warning');
  const codeEl = document.getElementById('pairing-code-container');

  // Check if domain is set
  const hasUrl = state.stepData.gatewayUrl || !state.stepData.domainSkipped;

  if (!hasUrl) {
    // Show warning, hide code section
    gatingEl.style.display = 'block';
    codeEl.style.display = 'none';
    return;
  }

  // Auto-generate code on step enter
  await generatePairingCode();
}
```

### Pattern 5: Rate Limit Configuration

**What:** `@fastify/rate-limit` v10 with `global: false` uses `config.rateLimit` on each route.

```typescript
// Confirmed from existing app.ts:
await app.register(rateLimit as any, { global: false })

// Per-route opt-in (claim route):
app.post('/api/pairing/claim', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'  // or '60000' (ms) — both accepted
    }
  }
}, handler)
```

When rate limit is exceeded, `@fastify/rate-limit` returns 429 automatically with a `Retry-After` header. No custom handling needed.

### Anti-Patterns to Avoid

- **Don't use bcrypt for SYNC_PASSWORD comparison** — the auth system uses `crypto.timingSafeEqual` with plaintext. `process.env.SYNC_PASSWORD` is already plaintext after wizard setup. Don't re-hash or re-fetch from .env file.
- **Don't use a single Map for active + consumed distinction** — you need 410 (consumed) vs 404 (invalid/expired). Use separate tracking (`consumedCodes Set`).
- **Don't forget `.unref()` on setTimeout** — pairing code timers should not prevent the Node process from exiting cleanly during tests or graceful shutdown.
- **Don't add TOTAL_STEPS without updating every place it's used** — the stepper HTML, the `updateStepper()` loop, and `advanceStep()` all reference step count logic.
- **Don't allow generate endpoint in setup-only mode** — actually DO allow it (wizard calls it from the browser). Add `/api/pairing/` to the SETUP_ONLY_ALLOWLIST.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom IP counter + Map | `@fastify/rate-limit` config.rateLimit | Already registered, handles 429 + Retry-After automatically |
| Random code generation | `Math.random()` | `crypto.randomBytes()` | Cryptographically secure, no modulo bias when charset is power-of-2 size |
| JWT auth on generate | Custom token check | `authenticate` middleware from `middleware/auth.ts` | Already handles all JWT error codes with correct HTTP status responses |
| .env reading | `fs.readFile('.env')` | `process.env.SYNC_PASSWORD` directly | `writeEnvVar` already updates `process.env` in-place — no file re-read needed |

**Key insight:** `process.env.SYNC_PASSWORD` is always the current plaintext value because `writeEnvVar` updates `process.env[key] = value` immediately after every write. The claim endpoint reads it directly — no file I/O needed.

---

## Common Pitfalls

### Pitfall 1: Charset Modulo Bias

**What goes wrong:** Using `byte % charsetLength` where charsetLength is not a power of 2 produces non-uniform distribution (lower-indexed chars appear more often).

**Why it happens:** A byte (0–255) divided by 32 gives a remainder of 0–31 with perfect uniformity since 256 is evenly divisible by 32. Our chosen charset size is exactly 32 — this is safe.

**How to avoid:** The 32-char charset (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) divides 256 evenly (256/32=8). Use `byte % 32` safely. If charset length changes, verify divisibility or use rejection sampling.

### Pitfall 2: Consumed Code Tracking is Bounded

**What goes wrong:** The `consumedCodes Set` grows unboundedly if codes are claimed frequently over a long runtime.

**Why it happens:** Every claimed code is added to the Set but never removed.

**How to avoid:** Use `setTimeout(() => consumedCodes.delete(code), TTL_MS + 5000)` immediately after adding. This limits Set membership to a TTL+5s window. In practice, only one code can be active at a time so maximum Set size is 1 at any moment.

### Pitfall 3: Rate Limit Returns 503 in Setup-Only Mode

**What goes wrong:** The rate-limit middleware `onRequest` hook runs before the setup-only check, but the setup-only check returns 503 for `/api/pairing/claim` if it's not in the allowlist.

**How to avoid:** Add `/api/pairing/claim` (or the full `/api/pairing/` prefix) to `SETUP_ONLY_ALLOWLIST` in `app.ts`. The claim endpoint must work immediately after wizard completion.

### Pitfall 4: Timer Prevents Process Exit in Tests

**What goes wrong:** Integration tests hang because a `setTimeout` from `generateCode()` keeps the event loop alive.

**How to avoid:** Call `.unref()` on all `setTimeout` handles in `pairing-store.ts`. This tells Node the timer shouldn't prevent process exit if it's the only thing running.

### Pitfall 5: Wizard TOTAL_STEPS Mismatch

**What goes wrong:** The `updateStepper()` function loops from 0 to TOTAL_STEPS-1. If TOTAL_STEPS remains 5 but a 6th stepper dot is added to the HTML, the last dot is never updated visually.

**How to avoid:** Update `const TOTAL_STEPS = 5;` to `const TOTAL_STEPS = 6;` in the wizard JS. Add the 6th stepper dot to the HTML. Update step titles from "Step N of 5" to "Step N of 6".

### Pitfall 6: Code Expired vs. Code Never Existed — Both Return 404

**What goes wrong:** An expired code could return 410 incorrectly if it's still in `activeEntry` past its expiry (the setTimeout hasn't fired yet due to timer drift).

**How to avoid:** Check `activeEntry.expiresAt < new Date()` explicitly in `claimCode()` and treat as 'invalid'. The setTimeout is cleanup-only, not authoritative.

---

## Code Examples

### Charset Verification

```typescript
// Verified: charset has exactly 32 characters
// A-Z = 26, minus O (1) and I (1) = 24 letters
// 2-9 = 8 digits (no 0 and 1)
// Total: 24 + 8 = 32 chars ✓
// 256 % 32 === 0 → no modulo bias ✓
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Note: H comes after G, J comes after H (I is excluded), P comes after O (O excluded)
// Verify: A B C D E F G H J K L M N P Q R S T U V W X Y Z = 24 letters + 23456789 = 32
```

### Integration Test Pattern (matches existing tests)

```typescript
// tests/integration/pairing.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-32-chars-minimum-ok'
  process.env.SYNC_PASSWORD = 'test-password'
  process.env.GATEWAY_PUBLIC_URL = 'https://gw.example.com'
  app = await buildApp()
  await app.ready()
})

afterAll(async () => { await app.close() })

// Get JWT for authenticated calls
async function getToken(): Promise<string> {
  process.env.SYNC_USERNAME = 'admin'
  process.env.SYNC_PASSWORD = 'test-password'
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'admin', password: 'test-password' }
  })
  return JSON.parse(res.body).token
}

it('POST /api/pairing/generate returns code and expiresAt', async () => {
  const token = await getToken()
  const res = await app.inject({
    method: 'POST',
    url: '/api/pairing/generate',
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(res.statusCode).toBe(200)
  const body = JSON.parse(res.body)
  expect(body.success).toBe(true)
  expect(body.code).toMatch(/^[A-Z2-9]{6}$/)
  expect(body.expiresAt).toBeDefined()
})

it('POST /api/pairing/claim with valid code returns credentials', async () => {
  const token = await getToken()
  const genRes = await app.inject({
    method: 'POST', url: '/api/pairing/generate',
    headers: { Authorization: `Bearer ${token}` }
  })
  const { code } = JSON.parse(genRes.body)

  const claimRes = await app.inject({
    method: 'POST', url: '/api/pairing/claim',
    payload: { code }
  })
  expect(claimRes.statusCode).toBe(200)
  const body = JSON.parse(claimRes.body)
  expect(body.gatewayUrl).toBe('https://gw.example.com')
  expect(body.jwtSecret).toBeDefined()
  expect(body.syncPassword).toBeDefined()
})

it('POST /api/pairing/claim second use returns 410', async () => {
  const token = await getToken()
  const genRes = await app.inject({
    method: 'POST', url: '/api/pairing/generate',
    headers: { Authorization: `Bearer ${token}` }
  })
  const { code } = JSON.parse(genRes.body)

  await app.inject({ method: 'POST', url: '/api/pairing/claim', payload: { code } })
  const second = await app.inject({ method: 'POST', url: '/api/pairing/claim', payload: { code } })
  expect(second.statusCode).toBe(410)
})

it('POST /api/pairing/claim with unknown code returns 404', async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/pairing/claim',
    payload: { code: 'XXXXXX' }
  })
  expect(res.statusCode).toBe(404)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redis for ephemeral state | In-memory Map + setTimeout | Decided in v1.2 planning | No extra infrastructure; acceptable trade-off for single-instance container |
| bcrypt password verification | Plain timingSafeEqual on plaintext | Already established in auth.ts | SYNC_PASSWORD is plaintext in process.env — claim endpoint reads it directly |

---

## Open Questions

1. **Should `/api/pairing/` be in setup-only allowlist, or just `/api/pairing/claim`?**
   - What we know: Generate requires JWT auth (wizard is authenticated), claim is unauthenticated. The wizard page itself is in setup-only allowlist via `/setup`.
   - What's unclear: When the wizard JS calls `/api/pairing/generate`, is the gateway still in setup-only mode?
   - Recommendation: Add the entire `/api/pairing/` prefix to the allowlist. Both endpoints need to work immediately after wizard completion (before operator restarts gateway). Auth on generate protects it sufficiently.

2. **"Code claimed!" visual indicator in wizard — include or skip?**
   - Context document marks this as Claude's Discretion.
   - Recommendation: Skip for Phase 20. The operator's confirmation that pairing succeeded comes from the sync client side (Phase 21). Adding a polling endpoint or WebSocket just for the wizard indicator is complexity without a committed consumer.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `objetiva-sync-gateway/vitest.config.ts` |
| Quick run command | `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts tests/integration/pairing.integration.test.ts` |
| Full suite command | `cd objetiva-sync-gateway && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAIR-01 | Generate returns 6-char alphanumeric code + expiresAt | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | Wave 0 |
| PAIR-01 | Code charset excludes 0, O, I, 1 | unit | `npx vitest run tests/unit/pairing-store.test.ts` | Wave 0 |
| PAIR-01 | New generate invalidates previous active code | unit | `npx vitest run tests/unit/pairing-store.test.ts` | Wave 0 |
| PAIR-02 | Claim returns gatewayUrl, jwtSecret, syncPassword | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | Wave 0 |
| PAIR-02 | Case-insensitive code input normalized to uppercase | unit | `npx vitest run tests/unit/pairing-store.test.ts` | Wave 0 |
| PAIR-03 | Payload contains correct field names for sync consumption | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | Wave 0 |
| PAIR-04 | Second claim of same code returns 410 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | Wave 0 |
| PAIR-05 | 6th claim attempt within 1 minute from same IP returns 429 | integration | `npx vitest run tests/integration/pairing.integration.test.ts` | Wave 0 |
| SC-5 | Container restart invalidates codes (in-memory, not persisted) | unit | `npx vitest run tests/unit/pairing-store.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts`
- **Per wave merge:** `cd objetiva-sync-gateway && npx vitest run tests/unit/pairing-store.test.ts tests/integration/pairing.integration.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`: `cd objetiva-sync-gateway && npx vitest run`

### Wave 0 Gaps

- [ ] `tests/unit/pairing-store.test.ts` — covers PAIR-01 (charset, TTL, invalidation), PAIR-02 (case normalization), PAIR-04 (consumed tracking), SC-5
- [ ] `tests/integration/pairing.integration.test.ts` — covers PAIR-01, PAIR-02, PAIR-03, PAIR-04, PAIR-05 end-to-end via `app.inject()`

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `src/app.ts` — confirms @fastify/rate-limit registered with global:false, SETUP_ONLY_ALLOWLIST pattern, route registration order
- Direct code inspection of `src/routes/auth.ts` — confirms SYNC_PASSWORD is plaintext comparison (timingSafeEqual), no bcrypt
- Direct code inspection of `src/utils/env-writer.ts` — confirms `process.env[key] = value` in-place update after write
- Direct code inspection of `src/middleware/auth.ts` — confirms `authenticate` middleware pattern and error code structure
- Direct code inspection of `src/routes/setup.ts` — confirms TOTAL_STEPS, advanceStep(), inline HTML pattern, set-password stores plaintext
- Direct code inspection of `tests/integration/setup-wizard.integration.test.ts` — confirms `buildApp()` + `app.inject()` test pattern
- `.planning/phases/20-gateway-pairing-routes/20-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- Node.js crypto docs: `crypto.randomBytes(n)` returns cryptographically secure random bytes — standard for token generation
- @fastify/rate-limit v10 per-route config: `config.rateLimit: { max, timeWindow }` with `global: false` — consistent with app.ts comment "per-route opt-in via config.rateLimit"

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use; verified from package.json
- Architecture: HIGH — patterns derived directly from existing source code inspection
- Pitfalls: HIGH — derived from reading actual implementation (charset math, timer behavior, allowlist logic)
- Wizard step 6: HIGH — HTML/JS pattern fully established in existing 5 steps

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable stack, no fast-moving dependencies)
