# Phase 19: Setup Wizard Enhancement - Research

**Researched:** 2026-03-05
**Domain:** Vanilla JS step-gated wizard in Fastify inline HTML route
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wizard UI approach:**
- Enhanced inline HTML — keep the current pattern (HTML string in setup.ts), add step gating with vanilla JS
- One step visible at a time with Next/Back navigation buttons; completed steps shown as compact summary
- Pre-fill from preflight — on load, call `GET /api/setup/preflight` and pre-fill fields with current values; show all steps in order regardless
- Server-side validation on each step before allowing Next — "Next" calls the backend endpoint (test-db, save-jwt, etc.) and only advances on success (satisfies WIZ-01)

**Step flow (5 steps):**
1. Database (WIZ-02) — Split fields: host, port, user, password, database name. "Test Connection" button required to advance. Table verification shown as info/warning (doesn't block — tables may not exist yet during initial setup)
2. Domain (WIZ-03) — Protocol dropdown (http/https) + domain text field. Optional port field (collapsed/advanced, default hidden). Format validation only (no connectivity check — domain may not resolve yet). Skippable with warning: "Without a public URL, pairing won't work"
3. JWT Secret (WIZ-04) — Text input + "Generate JWT Secret" button producing 64-character hex string client-side. Min 32 chars validation. Saved via existing `/api/setup/save-jwt-secret`
4. Password — Admin username fixed (shown as info text), password-only input. Min 6 chars. Saved via existing `/api/setup/set-password`
5. Download (WIZ-05, WIZ-06) — Summary of all configured values (masked password), download button for .env file, restart instructions text ("Restart the server to apply all changes")

**.env generation and download:**
- Merge with .env.example — start from `.env.example` template, fill in wizard values, keep other vars with defaults/comments
- Server-side save is primary — each step already saves its value via env-writer (happens during Next validation). The .env is complete by the time the user reaches step 5
- Download is secondary — "Download a copy of your .env" button generates the file client-side or via a GET endpoint. Downloaded as `.env` (standard filename)
- Completion screen — summary with all values, download button, restart hint. No auto-restart

### Claude's Discretion
- Progress indicator visual style (step dots, numbered stepper, etc.)
- Exact layout and spacing of the step UI
- Whether to add a new `GET /api/setup/generate-env` endpoint or assemble client-side
- Startup banner visual formatting
- How to handle the "skip domain" flow in the .env output (omit GATEWAY_PUBLIC_URL or comment it out)

### Deferred Ideas (OUT OF SCOPE)
- Hot reload of JWT_SECRET after .env write (currently requires restart for JWT changes) — evaluate in Phase 19 or later
- Setup access token shown in container logs for first-time security — noted from Phase 18 (INT-04)
- QR code for pairing — Future requirement PAIR-F01
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WIZ-01 | Wizard paso a paso con gating (no avanza sin completar el paso anterior) | Client-side step state machine + server-side validation before advancing |
| WIZ-02 | Constructor visual de DATABASE_URL (host, port, user, password, database como campos separados) | Split inputs -> assemble URL client-side -> send to existing `/api/setup/test-db` |
| WIZ-03 | Configuración de dominio/subdominio Traefik (GATEWAY_PUBLIC_URL) | New `POST /api/setup/save-domain` endpoint using `writeEnvVar('GATEWAY_PUBLIC_URL', ...)` |
| WIZ-04 | Generación automática de JWT_SECRET (64 chars hex) | `crypto.getRandomValues` already in codebase; save via existing `/api/setup/save-jwt-secret` |
| WIZ-05 | Generación completa del archivo .env desde la wizard | `GET /api/setup/generate-env` reads current .env and returns it as a file download |
| WIZ-06 | Download del .env generado como archivo | Content-Disposition: attachment header on the generate-env endpoint |
</phase_requirements>

---

## Summary

Phase 19 is a UI/UX enhancement of an existing 920-line inline HTML route (`src/routes/setup.ts`). The current wizard shows all 4 steps simultaneously with no gating — any step can be submitted in any order. The enhancement converts this into a 5-step gated flow where each step is validated server-side before advancing, with the 5th step producing a downloadable `.env` file.

The key technical insight is that all backend infrastructure already exists and is battle-tested from Phase 18: `writeEnvVar` handles .env mutation with proper escaping and mutex, `/api/setup/preflight` provides pre-fill data on load, and individual save endpoints (`/api/setup/test-db`, `/api/setup/save-jwt-secret`, `/api/setup/set-password`) are already wired. The only new backend work is: (1) a `POST /api/setup/save-domain` endpoint for GATEWAY_PUBLIC_URL, and (2) a `GET /api/setup/generate-env` endpoint for the file download.

The bulk of Phase 19 work is replacing the flat HTML structure with a step-gated JavaScript state machine using vanilla JS — no new frontend dependencies. The current DB step uses a single `DATABASE_URL` text input; this changes to 5 separate fields (host, port, user, password, db name) that assemble the URL before calling the existing test-db endpoint.

**Primary recommendation:** Rewrite only the HTML/JS in `setup.ts` (the route handler body). Keep all 6 existing API endpoints intact. Add 2 new endpoints. Total diff is approximately +400/-200 lines, all in one file.

---

## Standard Stack

### Core (unchanged from existing codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | ^5.7.4 | HTTP server, route registration | Already in use |
| Zod | ^3.23.8 | Request body validation | Already used for TestDbSchema, SetPasswordSchema |
| `writeEnvVar` / `writeEnvVars` | internal | Atomic .env writes with mutex + escaping | Phase 18 deliverable, covers all edge cases |
| `crypto.getRandomValues` | Web Crypto API (native in Node.js 19+) | Client-side JWT hex generation | Already used in current wizard JS |
| Vitest | ^4.0.18 | Test framework | Already configured |

### No New Dependencies Required
The entire phase is implementable with the existing stack. No new npm packages needed.

**Installation:**
```bash
# No new packages — all infrastructure is already in place
```

---

## Architecture Patterns

### Recommended File Structure (changes only)
```
src/routes/setup.ts         # PRIMARY: replace HTML/JS body, add 2 new API endpoints
tests/unit/setup-wizard.test.ts    # NEW: unit tests for URL assembly logic
tests/integration/setup-wizard.integration.test.ts  # NEW: integration tests for new endpoints
```

### Pattern 1: Client-Side Step State Machine (vanilla JS)

**What:** A JS object tracks which step is active and which steps are completed. "Next" buttons are disabled until the step's validation succeeds. Only the active step's form fields are visible; completed steps show a compact read-only summary.

**When to use:** Confirmed decision — no React/HTMX allowed (Phase 17 rollback decision).

**Implementation approach:**
```javascript
// Client-side state (inside <script> in the HTML string)
const state = {
  currentStep: 0,          // 0-indexed
  completedSteps: new Set(), // set of step indices that passed server validation
  stepData: {}             // cached values from each completed step
}

function goToStep(index) {
  // Hide all steps, show only index
  document.querySelectorAll('.wizard-step').forEach((el, i) => {
    el.style.display = i === index ? 'block' : 'none'
  })
  state.currentStep = index
  renderProgress()
}

async function nextStep() {
  const ok = await validateCurrentStep()  // calls backend
  if (!ok) return                         // stays on current step, shows error
  state.completedSteps.add(state.currentStep)
  goToStep(state.currentStep + 1)
}
```

**Step unlock rule:** A step's "Next" button is always clickable, but `nextStep()` calls the backend. On backend failure, the step stays active and shows the error. Back button is always enabled (no validation needed to go back).

### Pattern 2: Split DB Fields -> URL Assembly

**What:** Replace the single `DATABASE_URL` text input with 5 inputs: host, port (default 5432), user, password, database. Client assembles the URL before calling the existing `/api/setup/test-db` endpoint.

**URL assembly (client-side):**
```javascript
function assembleDbUrl() {
  const host = document.getElementById('db-host').value.trim()
  const port = document.getElementById('db-port').value.trim() || '5432'
  const user = document.getElementById('db-user').value.trim()
  const pass = document.getElementById('db-password').value.trim()
  const dbName = document.getElementById('db-name').value.trim()
  // encode user/pass to handle special chars in the URL
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${dbName}`
}
```

Note: `encodeURIComponent` is used for user/pass in the URL because those fields may contain `@`, `:`, `/`. The env-writer then stores the raw assembled URL, properly double-quoted.

### Pattern 3: Domain Step — Skippable with Warning

**What:** The domain step has a "Skip" button that advances without calling the backend. No GATEWAY_PUBLIC_URL is written when skipped. The download step shows a warning if domain was skipped.

**Implementation:**
```javascript
async function skipDomainStep() {
  showAlert('domain-alert', 'warning',
    'Warning: Without GATEWAY_PUBLIC_URL, pairing (Phase 20) will not work.')
  state.stepData.domainSkipped = true
  state.completedSteps.add(state.currentStep)
  goToStep(state.currentStep + 1)
}
```

### Pattern 4: .env Download via GET Endpoint

**What:** `GET /api/setup/generate-env` reads the current `.env` file and returns it with `Content-Disposition: attachment; filename=".env"`. This is the simplest approach — the file is already written by each step's save, so generate-env just reads and returns it.

**Server-side endpoint:**
```typescript
// New endpoint in setup.ts
app.get('/api/setup/generate-env', async (_request, reply) => {
  try {
    const envPath = path.join(process.cwd(), '.env')
    const content = await fs.readFile(envPath, 'utf-8')
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename=".env"')
      .send(content)
  } catch (error) {
    return reply.code(500).send({ error: 'Could not read .env file' })
  }
})
```

**Client-side trigger:**
```javascript
// No fetch needed — just navigate to the URL
function downloadEnv() {
  window.location.href = '/api/setup/generate-env'
}
```

### Pattern 5: New Domain Save Endpoint

**What:** `POST /api/setup/save-domain` accepts `{ protocol, domain, port? }`, assembles GATEWAY_PUBLIC_URL, and calls `writeEnvVar`.

```typescript
const SaveDomainSchema = z.object({
  protocol: z.enum(['http', 'https']),
  domain: z.string().min(1),
  port: z.string().optional()
})

app.post('/api/setup/save-domain', async (request, reply) => {
  const { protocol, domain, port } = SaveDomainSchema.parse(request.body)
  const url = port ? `${protocol}://${domain}:${port}` : `${protocol}://${domain}`
  await writeEnvVar('GATEWAY_PUBLIC_URL', url)
  return reply.send({ success: true, url })
})
```

### Pattern 6: Pre-fill from Preflight on Page Load

**What:** On `DOMContentLoaded`, the wizard calls `GET /api/setup/preflight` and the existing `GET /api/setup/status` to pre-fill fields with current values if already configured.

**Pre-fill logic:**
```javascript
window.addEventListener('DOMContentLoaded', async () => {
  const [preflightRes, statusRes] = await Promise.all([
    fetch('/api/setup/preflight').then(r => r.json()),
    fetch('/api/setup/status').then(r => r.json())
  ])

  // Pre-fill DB fields from status.database if present
  if (statusRes.database) {
    document.getElementById('db-host').value = statusRes.database.host
    document.getElementById('db-port').value = statusRes.database.port
    document.getElementById('db-user').value = statusRes.database.username
    document.getElementById('db-name').value = statusRes.database.database
    // Mark DB step as pre-completed (user still has to click Test Connection)
  }

  // Pre-fill JWT if configured
  if (statusRes.jwt) {
    // Don't pre-fill the actual secret — show configured indicator instead
    document.getElementById('jwt-configured-badge').style.display = 'block'
  }

  // Pre-fill domain if GATEWAY_PUBLIC_URL is set
  if (process.env — read from preflight check message or add to status endpoint)
})
```

Note: The existing `/api/setup/status` does not return GATEWAY_PUBLIC_URL. The status endpoint should be extended to include it, OR the preflight check message can be parsed. **Recommended:** extend `/api/setup/status` to include `gatewayUrl: process.env.GATEWAY_PUBLIC_URL || null`.

### Anti-Patterns to Avoid

- **Do NOT validate domain by making an HTTP request to it** — the domain may not resolve yet during initial setup (decision: format-only validation)
- **Do NOT block DB step on missing tables** — tables may not exist during initial setup; table check is informational only
- **Do NOT use `innerHTML` with user-provided values in alerts** — use `textContent` or sanitize first (XSS risk in admin panel)
- **Do NOT store db-password in `state.stepData` as plain string** — clear it after successful DB test; never include it in a summary display (only show `***`)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env write with escaping | Custom file write logic | `writeEnvVar()` from env-writer.ts | Already handles `$`, `#`, `"`, `\` edge cases + mutex |
| Special char escaping in DB URL | Custom encoder | `encodeURIComponent()` (native) | Handles `@`, `:`, `/`, spaces in username/password |
| JWT secret generation | Custom PRNG | `crypto.getRandomValues(new Uint8Array(32))` | Already in current wizard; CSPRNG, no deps |
| File download | Custom base64 encoding | HTTP `Content-Disposition: attachment` header | Browser handles file save natively |
| DB connection test | Custom pg client | Existing `/api/setup/test-db` endpoint (Prisma) | Already implemented and tested |

**Key insight:** All hard problems (escaping, mutex, connection testing) were solved in Phase 18. Phase 19 is a UI wiring exercise.

---

## Common Pitfalls

### Pitfall 1: encodeURIComponent in DATABASE_URL vs. raw value in .env

**What goes wrong:** User enters `p@ssw0rd!` as DB password. If assembled into URL without encoding: `postgresql://user:p@ssw0rd!@host/db` — the `@` breaks URL parsing, sending the wrong host.

**Why it happens:** `URL` constructor and pg driver parse `://user:pass@host` by splitting on the first unescaped `@`.

**How to avoid:** Use `encodeURIComponent(pass)` when assembling the URL for test-db. The env-writer stores the raw assembled URL (which is already percent-encoded), so it round-trips correctly.

**Warning signs:** Test connection fails with "invalid URL" or connects to wrong host.

---

### Pitfall 2: Step state gets out of sync with .env state

**What goes wrong:** User completes step 3 (JWT), hits Back, re-submits step 2 (Domain) with different value. But `state.completedSteps` still has step 3 marked as done with old data.

**How to avoid:** When going Back to a step, do NOT clear `completedSteps` for later steps. The backend source of truth is the .env file. On the download step, always re-read from the server (call `/api/setup/status` again) to render the summary, not from client-side `state.stepData`.

---

### Pitfall 3: .env template merge correctness

**What goes wrong:** The `GET /api/setup/generate-env` endpoint just reads the current `.env` file. If the operator runs the wizard before having a `.env` file at all, and then skips back to create one, the file may be missing entries.

**How to avoid:** The env-writer already creates the file from scratch with a header comment if it doesn't exist (`content = '# .env — Generated by Objetiva Sync Gateway\n'`). The generate-env endpoint reads whatever exists. This is correct behavior — each step writes its variable, so by step 5 all configured vars are present.

**Note:** The downloaded `.env` will NOT contain entries from `.env.example` that were never touched by the wizard (e.g., `LOG_LEVEL`, `APP_NAME`). This is acceptable per the decision "wizard fields only" but could surprise operators expecting a complete file. **Recommendation:** In the generate-env endpoint, merge the current .env content with .env.example defaults for any keys not yet set.

---

### Pitfall 4: XSS in admin-only HTML page

**What goes wrong:** User-entered domain value gets injected into `innerHTML` alert text.

**Why it matters:** Even though this is an admin-only page behind the setup route, XSS is still bad practice.

**How to avoid:** Use `element.textContent = value` for user-provided strings in alerts. Reserve `innerHTML` for trusted static strings (e.g., the spinner HTML).

---

### Pitfall 5: Port field in domain step — empty vs. "80"/"443"

**What goes wrong:** Operator enters `https://gateway.example.com` but also fills in port `443`. Resulting URL: `https://gateway.example.com:443` — which is technically correct but ugly and may confuse downstream code that checks for default ports.

**How to avoid:** If the port matches the default for the selected protocol (80 for http, 443 for https), omit it from the assembled URL. If the port field is empty, omit it entirely.

---

## Code Examples

### Step Gating Pattern (HTML structure)
```html
<!-- Source: vanilla JS best practice — no external deps -->
<div id="wizard-steps">
  <div class="wizard-step" id="step-0">
    <!-- Database step content -->
    <button onclick="nextStep()" id="next-step-0">Test Connection &amp; Next</button>
  </div>
  <div class="wizard-step" id="step-1" style="display:none">
    <!-- Domain step content -->
    <button onclick="prevStep()">Back</button>
    <button onclick="skipDomainStep()">Skip (not recommended)</button>
    <button onclick="nextStep()">Save &amp; Next</button>
  </div>
  <!-- steps 2, 3, 4 ... -->
</div>

<div id="progress-bar">
  <!-- e.g., Step 1 of 5 | ●●○○○ -->
</div>
```

### Zod Schema for Domain Endpoint
```typescript
// Source: existing pattern in setup.ts (TestDbSchema, SetPasswordSchema)
const SaveDomainSchema = z.object({
  protocol: z.enum(['http', 'https']),
  domain: z.string()
    .min(1, 'Domain is required')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Domain must be a valid hostname or FQDN'),
  port: z.string()
    .regex(/^\d+$/, 'Port must be numeric')
    .optional()
    .or(z.literal(''))
})
```

### Content-Disposition for .env Download
```typescript
// Source: HTTP spec + Fastify docs
return reply
  .header('Content-Type', 'text/plain; charset=utf-8')
  .header('Content-Disposition', 'attachment; filename=".env"')
  .send(content)
```

### Extending /api/setup/status for Domain Pre-fill
```typescript
// Add to existing GET /api/setup/status handler
const GATEWAY_PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL || null

return reply.send({
  database: dbInfo,
  jwt: jwtInfo,
  auth: authInfo,
  gatewayUrl: GATEWAY_PUBLIC_URL   // NEW
})
```

### .env.example Merge Logic (generate-env endpoint)
```typescript
// Read .env.example for defaults; overlay with current .env values
async function buildCompleteEnv(): Promise<string> {
  const examplePath = path.join(process.cwd(), '.env.example')
  const envPath = path.join(process.cwd(), '.env')

  const [exampleContent, currentContent] = await Promise.all([
    fs.readFile(examplePath, 'utf-8').catch(() => ''),
    fs.readFile(envPath, 'utf-8').catch(() => '')
  ])

  // Parse current .env into a Map<key, line>
  const currentLines = new Map<string, string>()
  for (const line of currentContent.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/)
    if (match) currentLines.set(match[1], line)
  }

  // Walk example, replace lines where current has a value
  const output = exampleContent.split('\n').map(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/)
    if (match && currentLines.has(match[1])) {
      return currentLines.get(match[1])!
    }
    return line
  })

  return output.join('\n')
}
```

---

## State of the Art

| Old Approach (current wizard) | New Approach (Phase 19) | Impact |
|-------------------------------|------------------------|--------|
| All steps visible simultaneously | One step visible, others hidden | Satisfies WIZ-01 gating |
| Single DATABASE_URL text field | 5 separate inputs assembled client-side | Satisfies WIZ-02 |
| No domain/GATEWAY_PUBLIC_URL field | Domain step with new save endpoint | Satisfies WIZ-03 |
| "Generate" button replaces input | Same button, validated as step | Satisfies WIZ-04 |
| No .env download | Step 5 download via GET endpoint | Satisfies WIZ-05, WIZ-06 |
| Status section at bottom | Compact summary in step 5 | Cleaner UX |

**Deprecated in this phase:**
- The free-floating status badges at the bottom of the current wizard — replaced by step-5 summary
- The "Verificar Tablas" as a separate Step 3 — absorbed into Step 1 (Database) as informational check

---

## Open Questions

1. **GATEWAY_PUBLIC_URL in .env.example**
   - What we know: `.env.example` does not currently contain `GATEWAY_PUBLIC_URL` (confirmed by reading the file). The preflight check warns when it's absent.
   - What's unclear: Should it be added to `.env.example` before Phase 19, or added as part of Phase 19?
   - Recommendation: Add `GATEWAY_PUBLIC_URL=` (empty, commented) to `.env.example` as part of Phase 19 plan. The generate-env merge will then include it in the downloaded file.

2. **DB password in pre-fill**
   - What we know: `/api/setup/status` parses `DATABASE_URL` and returns host/port/user/database — but NOT the password (it strips it).
   - What's unclear: When user returns to step 1, the password field will be empty. Should we show a "password already configured, enter to change" hint?
   - Recommendation: Show a placeholder `[configured]` and only update the DB URL if the test-connection button is clicked with a non-empty password field. If password field is empty and other fields match, skip re-saving.

3. **Domain format validation client-side vs. server-side**
   - What we know: Decision says "format validation only, no connectivity check." Zod regex on domain is simple.
   - Recommendation: Validate on server in `SaveDomainSchema` (Zod). Client-side shows error immediately for obvious invalid patterns (empty, spaces). Do not attempt DNS lookup.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | `objetiva-sync-gateway/vitest.config.ts` |
| Quick run command | `cd objetiva-sync-gateway && npx vitest run tests/unit/setup-wizard.test.ts` |
| Full suite command | `cd objetiva-sync-gateway && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIZ-01 | Next button does not advance on incomplete step | Integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ❌ Wave 0 |
| WIZ-02 | DB split fields assemble correct DATABASE_URL | Unit | `npx vitest run tests/unit/setup-wizard.test.ts` | ❌ Wave 0 |
| WIZ-03 | Domain step saves GATEWAY_PUBLIC_URL via POST endpoint | Integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ❌ Wave 0 |
| WIZ-04 | JWT generate button fills 64-char hex (client-side) | Unit | `npx vitest run tests/unit/setup-wizard.test.ts` | ❌ Wave 0 |
| WIZ-05 | GET /api/setup/generate-env returns .env content | Integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ❌ Wave 0 |
| WIZ-06 | generate-env has Content-Disposition: attachment header | Integration | `npx vitest run tests/integration/setup-wizard.integration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd objetiva-sync-gateway && npx vitest run tests/unit/`
- **Per wave merge:** `cd objetiva-sync-gateway && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/setup-wizard.test.ts` — unit tests for URL assembly (WIZ-02) and hex generation (WIZ-04)
- [ ] `tests/integration/setup-wizard.integration.test.ts` — integration tests for new endpoints (WIZ-01, WIZ-03, WIZ-05, WIZ-06)

*(Note: existing tests `env-writer.test.ts`, `preflight.integration.test.ts` remain green — no changes to those files)*

---

## Sources

### Primary (HIGH confidence)
- Direct code reading — `src/routes/setup.ts` (920 lines, full read) — current step HTML/JS structure
- Direct code reading — `src/utils/env-writer.ts` — `writeEnvVar`, `writeEnvVars` API, escaping behavior
- Direct code reading — `src/routes/preflight.ts` — `GET /api/setup/preflight` response shape, check IDs
- Direct code reading — `src/lib/system-state.ts` — `systemState` singleton fields
- Direct code reading — `.env.example` — all required env var keys and their defaults
- Direct code reading — `package.json` — exact dependency versions (Fastify 5.7.4, Zod 3.23.8, Vitest 4.0.18)
- Direct code reading — `vitest.config.ts` — test framework configuration
- Direct code reading — `19-CONTEXT.md` — all locked decisions, step flow, deferred items

### Secondary (MEDIUM confidence)
- `tests/integration/preflight.integration.test.ts` — established test patterns (buildApp, inject, beforeAll/afterAll)
- `tests/unit/env-writer.test.ts` (existence confirmed) — unit test pattern for the project

### Tertiary (LOW confidence)
- None — all findings are based on direct codebase reading

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json
- Architecture: HIGH — based on reading actual source files; patterns are extensions of existing code
- Pitfalls: HIGH — derived from reading env-writer escaping logic and URL parsing behavior
- New endpoints needed: HIGH — confirmed by checking all existing endpoints in setup.ts

**Research date:** 2026-03-05
**Valid until:** Stable (depends only on this codebase, not external libraries)
