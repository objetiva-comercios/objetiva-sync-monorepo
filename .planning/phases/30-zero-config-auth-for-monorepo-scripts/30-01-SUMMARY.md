---
phase: 30
plan: 1
title: Zero-config auth for regenerate-schemas
status: complete
requirements_completed: [ZEROAUTH-01, ZEROAUTH-02, ZEROAUTH-03, ZEROAUTH-04]
---

## One-liner

Regenerate-schemas auto-discovers gateway URL and obtains JWT via POST /api/setup/token — zero manual .env needed.

## Accomplishments

1. **Auto-discovery of gateway URL** — Script reads `GATEWAY_PUBLIC_URL` from `objetiva-sync-gateway/data/.env` or `objetiva-sync-gateway/.env` (written by setup wizard)
2. **Auto-authentication via gateway** — Requests JWT token from `POST /api/setup/token` (same unauthenticated endpoint the dashboard uses)
3. **codegen accepts pre-obtained tokens** — `JWT_TOKEN` env var takes priority over `JWT_SECRET` signing
4. **Full backward compatibility** — Manual `.env` with `GATEWAY_URL` + `JWT_SECRET` still works as fallback
5. **Works on VPS and dev machine** — VPS sparse checkout has gateway `.env` with real URL; dev machine has localhost

## Files Modified

- `scripts/regenerate-schemas.ts` — Added `discoverGatewayUrl()`, `requestGatewayToken()`, `resolveAuth()`
- `objetiva-sync-gateway/src/codegen/index.ts` — Renamed `signLocalToken()` to `getAuthToken()`, added JWT_TOKEN priority
- `.env.example` — Marked GATEWAY_URL/JWT_SECRET as optional overrides
- `objetiva-sync-gateway/DEPLOY.md` — Updated Paso 1-2 and troubleshooting section

## Verification

- Tested dry-run against production VPS with `SKIP_DOTENV=1` — auto-authenticated successfully
- TypeScript compiles clean (`npx tsc --noEmit`)
- All 4 entity schemas fetched and diffed correctly
