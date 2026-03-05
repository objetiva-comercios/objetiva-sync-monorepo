# Phase 21: Sync Pairing Client - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator enters the 6-character pairing code in the sync dashboard and the sync-to-gateway connection configures itself automatically. Requirements: SPC-01, SPC-02, SPC-03.

</domain>

<decisions>
## Implementation Decisions

### Pairing UI placement
- New dedicated card placed between the status banner and the manual config form in `api.ejs`
- Always visible — even when API is already configured (supports re-pairing)
- Single text field (not 6 separate boxes), monospaced, max 6 chars, auto-uppercase
- Minimal text: title "Enlazar via código", helper "Ingresá el código de 6 caracteres del gateway"
- Visual divider "— o configurar manualmente —" between pairing card and manual config form below
- Two fields in pairing card: gateway URL input + code input + "Conectar" button
- If REMOTE_API_URL already configured, pre-fill the gateway URL field

### Config mapping
- Map claim response to existing config keys: gatewayUrl → REMOTE_API_URL, 'sync' → REMOTE_API_USERNAME, syncPassword → REMOTE_API_PASSWORD (encrypted via encrypt())
- Store jwtSecret in SQLite config as new key (encrypted) — gateway-client.ts reads from config
- Update gateway-client.ts: read from SQLite config first (REMOTE_API_URL, JWT_SECRET key), fall back to process.env
- After successful pairing, auto-fill the manual config form below with received values (reload form data)

### Connection test behavior
- Reuse existing POST /api/config/api/test endpoint after pairing saves config
- On test failure: keep credentials saved, show warning "Enlazado pero sin conexión — verificar que el gateway esté corriendo" with retry button
- On test success: status card refreshes to show "API Configurada y Funcionando"

### Claim error handling
- Three distinct error states matching Phase 20 API responses:
  - 404 → "Código inválido o expirado"
  - 410 → "Código ya fue utilizado"
  - Network error → "No se pudo conectar al gateway"

### Pairing state feedback
- During claim: "Conectar" button becomes spinner + "Enlazando..." text, input becomes readonly
- On success: green banner "✓ Enlazado exitosamente con [gatewayUrl]", input clears, card stays visible for future re-pairing
- On error: red inline message below the input with specific error text
- After success + test, status card auto-refreshes

### Claude's Discretion
- Exact Tailwind styling for the pairing card
- Gateway URL input validation (auto-prepend https://)
- Whether to add a small info tooltip explaining the pairing flow
- Notification mechanism (inline vs toast)

</decisions>

<specifics>
## Specific Ideas

- The pairing card should feel lightweight — not as heavy as the full config form. A simple card with border, not shadow.
- Gateway URL field should auto-prepend https:// on blur, same as the existing api-url field pattern in the manual form

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `config-repo.ts`: getConfig/setConfig with SQLite upsert — stores all pairing results
- `crypto.ts`: encrypt/decrypt — encrypts password and jwtSecret before storage
- `api.ejs`: Current API config page — pairing card inserted above existing form
- `config.ts` (routes/api/): POST /api/config/api/test — reused for auto connection test after pairing
- `gateway-client.ts`: getGatewayUrl/getGatewayJwtSecret — needs update to read from SQLite config first

### Established Patterns
- `setConfig(key, value, encrypted)` for persisting config to SQLite — same pattern for pairing results
- `encrypt()/decrypt()` for sensitive values — password and jwtSecret
- `escapeHtml()` for inline HTML responses — existing in config.ts
- Auto-prepend https:// on blur — existing pattern in api.ejs
- Fetch-based API calls in EJS scripts — existing pattern for form submission and test

### Integration Points
- `api.ejs`: Add pairing card HTML + JS above existing form
- `config.ts` (routes/api/): Add POST /api/config/pairing/claim route that calls gateway's claim endpoint
- `gateway-client.ts`: Update to read REMOTE_API_URL and JWT_SECRET from SQLite config with env fallback
- `config-repo.ts`: No changes needed — getConfig/setConfig already sufficient

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-sync-pairing-client*
*Context gathered: 2026-03-05*
