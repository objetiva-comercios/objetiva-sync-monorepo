# Phase 21: Sync Pairing Client - Research

**Researched:** 2026-03-05
**Domain:** Fastify dashboard routes + EJS templating + SQLite config persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pairing UI placement:**
- New dedicated card placed between the status banner and the manual config form in `api.ejs`
- Always visible — even when API is already configured (supports re-pairing)
- Single text field (not 6 separate boxes), monospaced, max 6 chars, auto-uppercase
- Minimal text: title "Enlazar via código", helper "Ingresá el código de 6 caracteres del gateway"
- Visual divider "— o configurar manualmente —" between pairing card and manual config form below
- Two fields in pairing card: gateway URL input + code input + "Conectar" button
- If REMOTE_API_URL already configured, pre-fill the gateway URL field

**Config mapping:**
- Map claim response to existing config keys: gatewayUrl → REMOTE_API_URL, 'sync' → REMOTE_API_USERNAME, syncPassword → REMOTE_API_PASSWORD (encrypted via encrypt())
- Store jwtSecret in SQLite config as new key (encrypted) — gateway-client.ts reads from config
- Update gateway-client.ts: read from SQLite config first (REMOTE_API_URL, JWT_SECRET key), fall back to process.env
- After successful pairing, auto-fill the manual config form below with received values (reload form data)

**Connection test behavior:**
- Reuse existing POST /api/config/api/test endpoint after pairing saves config
- On test failure: keep credentials saved, show warning "Enlazado pero sin conexión — verificar que el gateway esté corriendo" with retry button
- On test success: status card refreshes to show "API Configurada y Funcionando"

**Claim error handling:**
- Three distinct error states matching Phase 20 API responses:
  - 404 → "Código inválido o expirado"
  - 410 → "Código ya fue utilizado"
  - Network error → "No se pudo conectar al gateway"

**Pairing state feedback:**
- During claim: "Conectar" button becomes spinner + "Enlazando..." text, input becomes readonly
- On success: green banner "✓ Enlazado exitosamente con [gatewayUrl]", input clears, card stays visible for future re-pairing
- On error: red inline message below the input with specific error text
- After success + test, status card auto-refreshes

### Claude's Discretion
- Exact Tailwind styling for the pairing card
- Gateway URL input validation (auto-prepend https://)
- Whether to add a small info tooltip explaining the pairing flow
- Notification mechanism (inline vs toast)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SPC-01 | Campo de entrada de código de pairing en la configuración de API del sync dashboard | UI card added to api.ejs above existing form — uses established EJS/Tailwind/Lucide pattern |
| SPC-02 | Botón de claim que ejecuta el intercambio y muestra resultado (éxito/error) | New route POST /api/config/pairing/claim in config.ts; calls gateway POST /api/pairing/claim; saves via setConfig(); three error states from Phase 20 contract |
| SPC-03 | Verificación automática de conexión después de pairing exitoso | Reuse existing POST /api/config/api/test endpoint; call it from client-side JS after saving config; refresh #api-status-container via htmx or fetch |
</phase_requirements>

---

## Summary

Phase 21 adds the sync-side pairing UI. All the heavy lifting (gateway pairing endpoint, credential delivery) was done in Phase 20. This phase is pure integration work: a small EJS card, one new Fastify route, and a gateway-client update.

The project uses a well-established pattern: EJS templates with vanilla fetch-based JS, Fastify routes in `routes/api/config.ts`, SQLite via `setConfig(key, value, encrypted)`, and AES-256-GCM encryption via `encrypt()`. Everything this phase needs already exists in the codebase — no new dependencies are required.

The gateway claim contract is confirmed from Phase 20 source: `POST /api/pairing/claim` returns `{ success, gatewayUrl, jwtSecret, syncPassword }` on 200, `error: 'CODE_CONSUMED'` on 410, and `error: 'CODE_INVALID'` on 404.

**Primary recommendation:** Add the pairing card to `api.ejs`, add `POST /api/config/pairing/claim` to `routes/api/config.ts`, update `gateway-client.ts` to read from SQLite config first. Zero new npm dependencies.

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | ^4.x | HTTP server + route registration | Existing dashboard server |
| EJS | existing | Server-side HTML templates | All dashboard views use EJS |
| Tailwind CSS | existing | Utility-class styling | All dashboard UI uses Tailwind |
| Lucide (CDN) | existing | Icon set | Icons rendered via `data-lucide` attributes |
| HTMX | existing | Declarative AJAX for status refresh | `htmx.ajax()` already used for `#api-status-container` |
| Drizzle ORM | existing | SQLite queries via `config-repo.ts` | All config persistence uses `setConfig()` |

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended File Changes
```
objetiva-sync/
├── src/
│   ├── dashboard/
│   │   ├── routes/
│   │   │   └── api/
│   │   │       └── config.ts           # Add POST /api/config/pairing/claim
│   │   └── views/
│   │       └── config/
│   │           └── api.ejs             # Add pairing card HTML + JS
│   └── services/
│       └── gateway-client.ts           # Update getGatewayUrl() + getGatewayJwtSecret()
└── tests/
    └── unit/
        └── config-pairing-claim.test.ts  # New unit tests for claim route
```

### Pattern 1: New Fastify Route (claim proxy)

The sync dashboard does NOT call the gateway directly from EJS. It proxies through a local Fastify route. This keeps credentials server-side and avoids CORS issues.

**What:** `POST /api/config/pairing/claim` receives `{ gatewayUrl, code }` from the browser, calls the gateway's claim endpoint, and on success saves the four config keys.

**When to use:** Any time sync-side JS needs to write to SQLite config.

```typescript
// Source: existing pattern in routes/api/config.ts
app.post(
  '/api/config/pairing/claim',
  { preHandler: requireNoPasswordChange },
  async (request, reply) => {
    const body = request.body as { gatewayUrl: string; code: string };

    if (!body.gatewayUrl || !body.code) {
      return reply.status(400).send({ success: false, error: 'Faltan campos requeridos' });
    }

    // Normalize gateway URL
    const baseUrl = body.gatewayUrl.replace(/\/+$/, '');

    try {
      const claimResponse = await fetch(`${baseUrl}/api/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: body.code }),
        signal: AbortSignal.timeout(10000),
      });

      if (claimResponse.status === 404) {
        return reply.status(404).send({ success: false, error: 'Código inválido o expirado' });
      }
      if (claimResponse.status === 410) {
        return reply.status(410).send({ success: false, error: 'Código ya fue utilizado' });
      }
      if (!claimResponse.ok) {
        return reply.status(502).send({ success: false, error: 'No se pudo conectar al gateway' });
      }

      const data = await claimResponse.json() as {
        success: boolean;
        gatewayUrl: string | null;
        jwtSecret: string | null;
        syncPassword: string | null;
      };

      // Save to SQLite config
      const resolvedGatewayUrl = data.gatewayUrl ?? baseUrl;
      await Promise.all([
        setConfig('REMOTE_API_URL', resolvedGatewayUrl),
        setConfig('REMOTE_API_USERNAME', 'sync'),
        setConfig('REMOTE_API_PASSWORD', encrypt(data.syncPassword ?? ''), true),
        setConfig('JWT_SECRET', encrypt(data.jwtSecret ?? ''), true),
      ]);

      return reply.send({ success: true, gatewayUrl: resolvedGatewayUrl });
    } catch {
      return reply.status(502).send({ success: false, error: 'No se pudo conectar al gateway' });
    }
  }
);
```

### Pattern 2: EJS Pairing Card with Vanilla JS

**What:** Self-contained `<div>` inserted between `#api-status-container` and the manual config form. All JS lives in the page's `<script>` block (same as existing `saveApiConfig`, `testApiConnection`).

**Structure:**
```html
<!-- Pairing Card (between status and manual form) -->
<div class="bg-white border border-gray-200 rounded-lg mb-6 px-4 py-5 sm:p-6">
  <h3 class="text-base font-medium text-gray-900 mb-1">Enlazar via código</h3>
  <p class="text-sm text-gray-500 mb-4">Ingresá el código de 6 caracteres del gateway</p>
  <div class="flex gap-3 items-start">
    <input id="pairing-gateway-url" type="text" placeholder="https://gateway.ejemplo.com"
      class="block w-full border border-gray-300 rounded-md py-2 px-3 text-sm ..." />
    <input id="pairing-code" type="text" maxlength="6" placeholder="ABC123"
      class="block w-28 border border-gray-300 rounded-md py-2 px-3 text-sm font-mono uppercase tracking-widest ..." />
    <button id="pairing-btn" onclick="claimPairingCode()"
      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 ...">
      <i data-lucide="link" class="w-4 h-4 mr-2"></i>
      Conectar
    </button>
  </div>
  <div id="pairing-result" class="mt-3 hidden"></div>
</div>

<!-- Divider -->
<div class="flex items-center my-6">
  <div class="flex-1 border-t border-gray-200"></div>
  <span class="px-3 text-xs text-gray-400">— o configurar manualmente —</span>
  <div class="flex-1 border-t border-gray-200"></div>
</div>
```

### Pattern 3: Client-side claim function

**What:** Fetch-based JS following the existing `saveApiConfig` / `testApiConnection` pattern.

```javascript
async function claimPairingCode() {
  const gatewayUrl = document.getElementById('pairing-gateway-url').value.trim();
  const code = document.getElementById('pairing-code').value.trim().toUpperCase();
  const btn = document.getElementById('pairing-btn');
  const resultDiv = document.getElementById('pairing-result');

  if (!gatewayUrl || code.length !== 6) {
    showPairingResult('error', 'Ingresá la URL del gateway y el código de 6 caracteres');
    return;
  }

  // Loading state
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i>Enlazando...';
  document.getElementById('pairing-code').readOnly = true;
  if (window.lucide) lucide.createIcons();

  try {
    const response = await fetch('/api/config/pairing/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewayUrl, code }),
    });

    const result = await response.json();

    if (result.success) {
      showPairingResult('success', `✓ Enlazado exitosamente con ${result.gatewayUrl}`);
      document.getElementById('pairing-code').value = '';
      // Reload manual form with new config
      loadApiConfig();
      // Auto-test connection
      const testResponse = await fetch('/api/config/api/test', { method: 'POST' });
      const testResult = await testResponse.json();
      if (!testResult.success) {
        showPairingResult('warning', 'Enlazado pero sin conexión — verificar que el gateway esté corriendo');
      }
      // Refresh status card
      loadApiStatus();
    } else {
      showPairingResult('error', result.error || 'Error desconocido');
    }
  } catch {
    showPairingResult('error', 'No se pudo conectar al gateway');
  } finally {
    // Reset button
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="link" class="w-4 h-4 mr-2"></i>Conectar';
    document.getElementById('pairing-code').readOnly = false;
    if (window.lucide) lucide.createIcons();
  }
}

function showPairingResult(type, message) {
  const div = document.getElementById('pairing-result');
  const classes = {
    success: 'text-green-700 bg-green-50 border border-green-200',
    error: 'text-red-700 bg-red-50 border border-red-200',
    warning: 'text-yellow-700 bg-yellow-50 border border-yellow-200',
  };
  div.className = `mt-3 rounded-md px-3 py-2 text-sm ${classes[type]}`;
  div.textContent = message;
  div.classList.remove('hidden');
}
```

### Pattern 4: gateway-client.ts update

**What:** Update `getGatewayUrl()` and `getGatewayJwtSecret()` to read from SQLite config first, fall back to `process.env`.

```typescript
// New imports needed in gateway-client.ts
import { getConfig } from '../store/repositories/config-repo.js';
import { decrypt } from '../utils/crypto.js';

async function getGatewayUrl(): Promise<string> {
  const configVal = await getConfig('REMOTE_API_URL');
  if (configVal?.value) return configVal.value;
  return process.env.GATEWAY_URL || 'http://localhost:3335';
}

async function getGatewayJwtSecret(): Promise<string | undefined> {
  const configVal = await getConfig('JWT_SECRET');
  if (configVal?.value) {
    return configVal.encrypted ? decrypt(configVal.value) : configVal.value;
  }
  return process.env.JWT_SECRET;
}
```

Note: `getGatewayUrl()` and `getGatewayJwtSecret()` become async — callers (`getJwtToken()`, `notifyGatewayCancellation()`) must be updated accordingly.

### Anti-Patterns to Avoid

- **Direct gateway call from browser JS:** CORS will block it; always proxy through the local Fastify route
- **Storing jwtSecret unencrypted:** Must use `encrypt()` with `encrypted: true` flag in `setConfig()`
- **Blocking on test result:** Pairing is successful regardless of the test result — save config first, test second, show appropriate message for each outcome
- **Making getGatewayUrl/getGatewayJwtSecret synchronous after update:** They now need async reads from SQLite; all callers must await

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config persistence | Custom SQLite writer | `setConfig(key, value, encrypted)` in `config-repo.ts` | Already handles upsert, logging, error handling |
| Credential encryption | Custom cipher | `encrypt()` in `crypto.ts` (AES-256-GCM) | Established key derivation + auth tag pattern |
| Connection test | New test logic | `POST /api/config/api/test` endpoint | Already tests credentials via /auth/login, stores test status |
| HTML escaping | String replace | `escapeHtml()` already in `config.ts` | XSS prevention already present |
| Status card refresh | New HTMX target | `loadApiStatus()` + `htmx.ajax()` already implemented | Function already exists and wired to `#api-status-container` |

---

## Common Pitfalls

### Pitfall 1: Gateway returns null for gatewayUrl/jwtSecret/syncPassword
**What goes wrong:** If the gateway's GATEWAY_PUBLIC_URL, JWT_SECRET, or SYNC_PASSWORD env vars are not set, the claim response returns `null` for those fields.
**Why it happens:** Phase 20 returns `process.env.X ?? null` — the gateway might not have all vars set at claim time.
**How to avoid:** Use `data.gatewayUrl ?? baseUrl` (fall back to the URL the user entered). Validate `jwtSecret` and `syncPassword` are non-null before saving; show specific error if missing.
**Warning signs:** `setConfig('REMOTE_API_PASSWORD', encrypt(null))` will throw.

### Pitfall 2: getGatewayUrl becoming async breaks notifyGatewayCancellation
**What goes wrong:** `notifyGatewayCancellation` is currently synchronous at the URL-reading level; making `getGatewayUrl` async means the caller must `await`.
**Why it happens:** The current `getGatewayUrl()` reads from `process.env` synchronously; after the update it reads from SQLite asynchronously.
**How to avoid:** Update `notifyGatewayCancellation` and `getJwtToken` to await the new async helpers. Mark them async if they aren't already.
**Warning signs:** TypeScript type errors on unresolved Promise<string>.

### Pitfall 3: Auto-uppercase input breaks on non-Latin characters
**What goes wrong:** `.toUpperCase()` on user input is fine for alphanumeric codes but can look odd if the user pastes content with spaces or special chars.
**Why it happens:** Pairing codes are 6-char alphanumeric but input isn't restricted server-side.
**How to avoid:** Add `oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)"` on the code input for real-time enforcement.

### Pitfall 4: HTMX status refresh after JS fetch
**What goes wrong:** `loadApiStatus()` uses `htmx.ajax()` which requires HTMX to be loaded. If called before HTMX is ready, it fails silently.
**Why it happens:** The existing code already uses this pattern — it's fine as long as HTMX loads before the page's `<script>` block runs (which it does, since it's in `<head>`).
**How to avoid:** Follow existing pattern — `loadApiStatus()` is already defined and working. No changes needed there.

### Pitfall 5: Retry button after test failure
**What goes wrong:** The "Enlazado pero sin conexión" warning needs a retry button, but it's rendered in `#pairing-result` inline div — the retry button must call `testApiConnection()`.
**How to avoid:** Render the warning with an embedded button using `innerHTML` instead of `textContent` for the warning case.

---

## Code Examples

### Existing config key names (confirmed from config.ts source)
```typescript
// Source: objetiva-sync/src/dashboard/routes/api/config.ts
const CONFIG_KEYS = {
  API_URL: 'REMOTE_API_URL',
  API_USERNAME: 'REMOTE_API_USERNAME',
  API_PASSWORD: 'REMOTE_API_PASSWORD',
  API_TEST_STATUS: 'REMOTE_API_TEST_STATUS',
  API_TEST_MESSAGE: 'REMOTE_API_TEST_MESSAGE',
  API_TESTED_AT: 'REMOTE_API_TESTED_AT',
};
// New key to add: 'JWT_SECRET'
```

### Gateway claim API contract (confirmed from Phase 20 source)
```typescript
// Source: objetiva-sync-gateway/src/routes/pairing.ts
// POST /api/pairing/claim
// Request: { code: string }
// Response 200: { success: true, gatewayUrl: string|null, jwtSecret: string|null, syncPassword: string|null }
// Response 404: { success: false, error: 'CODE_INVALID' }
// Response 410: { success: false, error: 'CODE_CONSUMED' }
// Response 400: { success: false, error: 'INVALID_INPUT' }
```

### setConfig with encryption (confirmed from config-repo.ts source)
```typescript
// Source: objetiva-sync/src/store/repositories/config-repo.ts
// encrypted=true stores the flag in SQLite alongside the value
await setConfig('JWT_SECRET', encrypt(jwtSecret), true);
await setConfig('REMOTE_API_PASSWORD', encrypt(syncPassword), true);
await setConfig('REMOTE_API_URL', gatewayUrl);         // no encryption
await setConfig('REMOTE_API_USERNAME', 'sync');        // no encryption
```

### Auto-prepend https:// on blur (existing api.ejs pattern)
```javascript
// Source: objetiva-sync/src/dashboard/views/config/api.ejs
document.getElementById('api-url').addEventListener('blur', function(e) {
  const input = e.target;
  const value = input.value.trim();
  if (value && !value.match(/^https?:\/\//i)) {
    input.value = 'https://' + value;
  }
});
// Apply same pattern to pairing-gateway-url input
```

### Reading encrypted config in gateway-client.ts
```typescript
// Source: objetiva-sync/src/utils/crypto.ts + config-repo.ts
const record = await getConfig('JWT_SECRET');
// record.encrypted is true → must decrypt
const secret = record.encrypted ? decrypt(record.value) : record.value;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sync reads gateway URL from process.env only | Read from SQLite first, fall back to process.env | Phase 21 | Enables hot config update without Windows service restart |
| Manual-only API config in dashboard | Pairing card provides automated config via 6-char code | Phase 21 | Operator UX: one-step linking |
| jwtSecret only in process.env | jwtSecret stored encrypted in SQLite config | Phase 21 | Survives service restart without env var |

---

## Open Questions

1. **What happens if SYNC_PASSWORD is null in claim response?**
   - What we know: Phase 20 returns `process.env.SYNC_PASSWORD ?? null` — if the gateway operator never set SYNC_PASSWORD, it will be null
   - What's unclear: Should sync allow pairing with a null password, or reject it?
   - Recommendation: Treat null syncPassword as an error — show "El gateway no tiene configurada la contraseña de sync (SYNC_PASSWORD)" and do not save config

2. **Should gateway-client async change affect any sync engine consumers?**
   - What we know: `notifyGatewayCancellation` is fire-and-forget; `getJwtToken` is sync currently
   - What's unclear: Are there other callers of `getJwtToken()` or `getGatewayUrl()` in the codebase?
   - Recommendation: Grep for usages before implementing to avoid missed async upgrades

---

## Validation Architecture

> `workflow.nyquist_validation` key is absent from config.json — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (vitest.config.ts at objetiva-sync root) |
| Config file | `objetiva-sync/vitest.config.ts` |
| Quick run command | `cd objetiva-sync && npm test -- --testPathPattern="config-pairing"` |
| Full suite command | `cd objetiva-sync && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPC-01 | Pairing card renders in api.ejs with correct fields | manual (EJS view, no server-side unit test) | manual — open browser | N/A |
| SPC-02 | POST /api/config/pairing/claim saves 4 config keys on 200 | unit | `cd objetiva-sync && npm test -- --testPathPattern="config-pairing"` | ❌ Wave 0 |
| SPC-02 | POST /api/config/pairing/claim returns 404 on invalid code | unit | same command | ❌ Wave 0 |
| SPC-02 | POST /api/config/pairing/claim returns 410 on consumed code | unit | same command | ❌ Wave 0 |
| SPC-02 | POST /api/config/pairing/claim returns 502 on network error | unit | same command | ❌ Wave 0 |
| SPC-03 | After claim success, /api/config/api/test is called automatically | unit (mock) | same command | ❌ Wave 0 |
| SPC-03 | gateway-client reads JWT_SECRET from SQLite before process.env | unit | `cd objetiva-sync && npm test -- --testPathPattern="gateway-client"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd objetiva-sync && npm test -- --testPathPattern="config-pairing|gateway-client" --run`
- **Per wave merge:** `cd objetiva-sync && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `objetiva-sync/tests/unit/config-pairing-claim.test.ts` — covers SPC-02 (claim route: success, 404, 410, 502, missing fields)
- [ ] `objetiva-sync/tests/unit/gateway-client.test.ts` — covers SPC-03 (SQLite-first read for URL and JWT secret)

*(Existing `tests/setup.ts` and `tests/store/repositories/config-repo.test.ts` patterns provide all needed fixtures — no new conftest needed)*

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `objetiva-sync/src/dashboard/routes/api/config.ts` — exact CONFIG_KEYS, setConfig pattern, test endpoint logic, escapeHtml
- Direct source read: `objetiva-sync/src/dashboard/views/config/api.ejs` — full EJS template, JS functions, https:// prepend pattern, htmx.ajax usage
- Direct source read: `objetiva-sync-gateway/src/routes/pairing.ts` — confirmed claim API contract (status codes, response shape)
- Direct source read: `objetiva-sync/src/services/gateway-client.ts` — current getGatewayUrl/getGatewayJwtSecret signatures (synchronous, env-only)
- Direct source read: `objetiva-sync/src/store/repositories/config-repo.ts` — setConfig/getConfig API including `encrypted` flag
- Direct source read: `objetiva-sync/src/utils/crypto.ts` — encrypt/decrypt signatures

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Decision: "Sync stores pairing result in SQLite setConfig (not .env write) — takes effect immediately without Windows service restart"
- `.planning/phases/21-sync-pairing-client/21-CONTEXT.md` — All locked decisions confirmed

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed from direct source reads
- Architecture: HIGH — all patterns confirmed from existing working code in the repo
- Pitfalls: HIGH (async pitfall), MEDIUM (null password edge case)
- Test infrastructure: HIGH — vitest.config.ts confirmed, test directory structure confirmed

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable stack, no fast-moving dependencies)
