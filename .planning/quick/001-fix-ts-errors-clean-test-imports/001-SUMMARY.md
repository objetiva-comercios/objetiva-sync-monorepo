---
phase: quick
plan: 001
subsystem: objetiva-sync/api-client, types, tests
tags: [typescript, cleanup, type-safety, api-client, test-imports]
dependency-graph:
  requires: []
  provides: [type-safe-api-clients, clean-test-imports, correct-types-barrel]
  affects: []
tech-stack:
  added: []
  patterns: [metadata-headers-all-clients, ternary-identifier-pattern]
key-files:
  created: []
  modified:
    - objetiva-sync/src/api-client/articulos-client.ts
    - objetiva-sync/src/api-client/comprobantes-detalle-client.ts
    - objetiva-sync/src/api-client/comprobantes-cabecera-client.ts
    - objetiva-sync/src/api-client/comprobantes-pagos-client.ts
    - objetiva-sync/src/api-client/auth.ts
    - objetiva-sync/src/types/index.ts
    - objetiva-sync/src/__tests__/api-client-metadata.test.ts
    - objetiva-sync/src/__tests__/sync-engine-metadata.test.ts
    - objetiva-sync/src/__tests__/repositories-query-based.test.ts
    - objetiva-sync/src/__tests__/integration-query-based-sync.test.ts
decisions:
  - id: Q001-D1
    title: "Use 'as any' for gateway response casting"
    choice: "Cast response.json() as any instead of APIResponse<BatchResult>"
    reason: "Matches existing pattern in articulos-client and detalle-client. Gateway response shape varies, making strict typing counterproductive."
  - id: Q001-D2
    title: "Remove dead refresh token code from auth.ts"
    choice: "Full removal of refreshAccessToken/doRefreshToken methods"
    reason: "Gateway does not support refresh tokens. getToken() already handles re-login on expiry. Dead code was the source of 6 type errors."
  - id: Q001-D3
    title: "Add metadata header logic to pagos-client"
    choice: "Feature parity -- pagos-client now sends X-Query-Id/X-Query-Name headers like the other 3 clients"
    reason: "Was the only client missing this. Metadata parameter was declared but unused, causing TS6133."
metrics:
  duration: ~12 minutes
  completed: 2026-02-05
---

# Quick Task 001: Fix TypeScript Errors and Clean Legacy Test Imports

**One-liner:** Eliminated 98 TypeScript errors across api-client/, types/index.ts, and __tests__/ by fixing stale imports, adding missing payload fields, removing dead auth code, and rebuilding the types barrel file.

## What Changed

### Task 1: Fix API Client TypeScript Errors (31 errors -> 0)

**articulos-client.ts (2 errors fixed)**
- Removed unused `APIResponse` import
- Added required `erp_codigo` and `erp_nombre2` fields to `testConnection()` payload

**comprobantes-detalle-client.ts (3 errors fixed)**
- Removed unused `APIResponse` import
- Fixed unreachable `??` operator on template literal -- replaced with ternary conditional
- Replaced `total: 100.0` in `testConnection()` with actual `IComprobanteDetallePayload` required fields (`comprobante_operacion`, `comprobante_formulario`, `comprobante_numero`, `precio_unitario`, `importe_bruto`, `importe_descuento`, `importe_neto`, `alicuota_iva`, `importe_iva`, `importe_total`)

**comprobantes-cabecera-client.ts (8 errors fixed)**
- Removed unused `APIResponse` import
- Changed response cast from `APIResponse<BatchResult>` to `any` (eliminates union type issues on `.inserted`/`.updated`/`.errors` access)
- Fixed `validateBatch()` identifier: replaced nonexistent `.comprobante` property with erp composite key ternary

**comprobantes-pagos-client.ts (12 errors fixed)**
- Removed unused `APIResponse` import
- Added metadata header logic (feature parity with other 3 clients): sends `X-Query-Id`, `X-Query-Name`, `X-Sync-Id`, `X-Batch-Number`, `X-Total-Batches`
- Changed response cast to `any`
- Fixed unreachable `??` with ternary
- Added required fields to `testConnection()` payload (`comprobante_operacion`, `comprobante_formulario`, `comprobante_numero`, `linea_numero`)

**auth.ts (6 errors fixed)**
- Removed dead `refreshAccessToken()` and `doRefreshToken()` methods (gateway uses re-login, not refresh tokens)
- Removed unused `isRefreshing`, `refreshPromise`, `refreshToken` private fields

### Task 2: Fix types/index.ts and Legacy Test Files (67 errors -> 0)

**types/index.ts (9 errors fixed)**
- Complete rewrite of barrel file
- Replaced stale module references (`./articulo.js`, `./comprobante.js`, `./pago.js`) with actual current modules (`./articulos.js`, `./comprobantes-cabecera.js`, `./comprobantes-detalle.js`, `./comprobantes-pagos.js`)
- All named type re-exports verified against actual module exports

**api-client-metadata.test.ts (5 errors fixed)**
- Updated imports: `ComprobantesClient` -> `ComprobantesCabeceraClient`, `PagosClient` -> `ComprobantesPagosClient`
- Updated type imports: `articulo.js` -> `articulos.js`, `comprobante.js` -> `comprobantes-cabecera.js`/`comprobantes-detalle.js`, `pago.js` -> `comprobantes-pagos.js`
- Fixed test payload objects with all required interface fields

**sync-engine-metadata.test.ts (8 errors fixed)**
- Removed `field-mappings-repo.js` mock (module no longer exists)
- Added missing fields to all mock Query objects: `incrementalType`, `joinField`, `lastTestStatus`, `lastTestAt`, `lastTestRowCount` (all `null`)

**repositories-query-based.test.ts (27 errors fixed)**
- Removed unused imports (`Database`, `drizzle`, `migrate`, `afterAll`)
- Replaced `getDb` with `getDatabase` (actual export name)
- Removed `initDatabase(':memory:')` argument (function takes no args)
- Removed `schema.fieldMappings` references (table was removed from schema)
- Removed `displayOrder`, `syncInterval`, `isScheduled` from `createQuery()` calls (not in parameter type)
- Added non-null assertions (`!`) to array index accesses
- Replaced `db.$eq()` calls with plain `.filter()` on query results

**integration-query-based-sync.test.ts (20 errors fixed)**
- Same fixes as repositories-query-based.test.ts
- Removed unused `SyncLogsRepo` import
- Added implicit `any` types to callback parameters

## Verification Results

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total tsc errors | 162 | 64 | -98 |
| src/api-client/ errors | 31 | 0 | -31 |
| src/types/index.ts errors | 9 | 0 | -9 |
| src/__tests__/ errors | 60 | 0 | -60 |
| Out-of-scope errors | ~62 | 64 | +2 (store/schema fieldMappings type, queries-repo) |

All 64 remaining errors are in out-of-scope files:
- `src/dashboard/routes/api/` (17 errors)
- `src/sync/` (32 errors)
- `src/services/gateway-client.ts` (7 errors)
- `src/store/` (3 errors)
- `src/store/repositories/queries-repo.ts` (1 error)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added importe_descuento to detalle test payload in api-client-metadata.test.ts**
- **Found during:** Task 2 verification
- **Issue:** `importe_descuento` is a required field on `IComprobanteDetallePayload` but was missing from the test detalle object
- **Fix:** Added `importe_descuento: 0` to test payload
- **Commit:** 82f8498 (part of Task 2)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 5d2689d | fix | Resolve 31 TypeScript errors in API client files |
| 82f8498 | fix | Rebuild types/index.ts and fix 4 legacy test files |

## Next Steps

The remaining 64 errors are in separate domains and should be addressed in dedicated quick tasks:
- **Dashboard routes** (17 errors): Type narrowing, unused imports, property mismatches
- **Sync engine/queue/scheduler** (32 errors): EntityType casting, missing properties, unused vars
- **Gateway client** (7 errors): Property access on typed responses
- **Store schema** (3 errors): Remove `fieldMappings` type exports (table was removed)
