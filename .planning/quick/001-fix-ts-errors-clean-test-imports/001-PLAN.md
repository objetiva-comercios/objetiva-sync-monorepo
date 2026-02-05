---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1: API client source fixes
  - objetiva-sync/src/api-client/articulos-client.ts
  - objetiva-sync/src/api-client/comprobantes-detalle-client.ts
  - objetiva-sync/src/api-client/comprobantes-cabecera-client.ts
  - objetiva-sync/src/api-client/comprobantes-pagos-client.ts
  - objetiva-sync/src/api-client/auth.ts
  # Task 2: types/index.ts legacy re-exports
  - objetiva-sync/src/types/index.ts
  # Task 3: Legacy test files
  - objetiva-sync/src/__tests__/api-client-metadata.test.ts
  - objetiva-sync/src/__tests__/sync-engine-metadata.test.ts
  - objetiva-sync/src/__tests__/repositories-query-based.test.ts
  - objetiva-sync/src/__tests__/integration-query-based-sync.test.ts
autonomous: true

must_haves:
  truths:
    - "npx tsc --noEmit shows zero errors in src/api-client/ files"
    - "npx tsc --noEmit shows zero errors in src/types/index.ts"
    - "npx tsc --noEmit shows zero errors in src/__tests__/ files"
  artifacts:
    - path: "objetiva-sync/src/api-client/articulos-client.ts"
      provides: "Clean imports, valid testConnection payload"
    - path: "objetiva-sync/src/api-client/comprobantes-cabecera-client.ts"
      provides: "Fixed type union for 207 Multi-Status handling"
    - path: "objetiva-sync/src/types/index.ts"
      provides: "Updated re-exports pointing to current module names"
  key_links:
    - from: "src/types/index.ts"
      to: "src/types/articulos.ts, comprobantes-cabecera.ts, etc."
      via: "re-export statements"
      pattern: "from './(articulos|comprobantes-cabecera|comprobantes-detalle|comprobantes-pagos)\\.js'"
---

<objective>
Fix TypeScript compilation errors in objetiva-sync/src/api-client/, objetiva-sync/src/types/index.ts, and objetiva-sync/src/__tests__/ legacy test files.

Purpose: The v1.1-rc milestone audit identified non-blocking TypeScript errors and test file legacy imports. While these don't affect runtime (the project builds with transpileOnly), fixing them restores type safety for future development.

Output: Zero TypeScript errors in the targeted files (api-client/*, types/index.ts, __tests__/*). Other source files (dashboard routes, sync engine, etc.) are out of scope -- they have their own separate error categories.
</objective>

<execution_context>
@C:\Users\sistemas\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\sistemas\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/v1.1-rc-MILESTONE-AUDIT.md

SCOPE NOTE: `npx tsc --noEmit` shows 162 total errors across the codebase. This plan addresses
only the errors in api-client/ (31 errors), types/index.ts (9 errors), and __tests__/ (60 errors).
The remaining ~62 errors in dashboard routes, sync engine, sync-queue, gateway-client, scheduler,
query-validator, store/schema are OUT OF SCOPE and should be handled in separate plans.

ERROR INVENTORY (in-scope files):

## src/api-client/ errors (31 errors across 5 files):

### articulos-client.ts (2 errors)
- Line 9: TS6196 - `APIResponse` imported but never used
- Line 338: TS2739 - testConnection() payload missing `erp_codigo`, `erp_nombre2` (required by IArticuloPayload)

### comprobantes-detalle-client.ts (3 errors)
- Line 9: TS6196 - `APIResponse` imported but never used
- Line 310: TS2869 - `??` operator unreachable (template literal `${a}-${b}-${c}-${d}` is always string)
- Line 331: TS2353 - testConnection() payload has `total` but IComprobanteDetallePayload expects different fields

### comprobantes-cabecera-client.ts (8 errors)
- Line 113: response cast as `APIResponse<BatchResult>`, then `data.data || data` creates union `BatchResult | APIResponse<BatchResult>`
  Lines 124-134: accessing `.inserted`, `.updated`, `.errors` fails on the APIResponse side of the union
- Line 148: `.result` does not exist on `APIResponse<BatchResult>`
- Line 273: `.comprobante` does not exist on `IComprobanteCabeceraPayload`

### comprobantes-pagos-client.ts (10 errors)
- Line 37: TS6133 - `metadata` parameter declared but never read (sendBatch has metadata in signature but doesn't use it for headers)
- Line 94: Same `APIResponse<BatchResult>` cast issue as cabecera-client (lines 105-115, 129)
- Line 254: TS2869 - `??` unreachable (same template literal pattern)
- Line 269: TS2739 - testConnection() payload missing `comprobante_operacion`, `comprobante_formulario`, `comprobante_numero`, `linea_numero`

### auth.ts (6 errors)
- Line 109: TS6133 - `refreshAccessToken` method declared but never read (dead code -- gateway doesn't support refresh tokens)
- Lines 153-168: `doRefreshToken()` accesses `data.data` but `LoginResponse` interface has no `data` property
- Line 168: Type `string | null` not assignable to `string` return

## src/types/index.ts (9 errors)
- Lines 13, 16, 19: re-exports from `./articulo.js`, `./comprobante.js`, `./pago.js` -- these modules were renamed to `./articulos.js`, `./comprobantes-cabecera.js`, etc.
- Lines 51, 59, 65, 84, 93, 101: same stale module references in named re-exports

## src/__tests__/ (60 errors across 4 files)
- api-client-metadata.test.ts (5 errors): imports `ComprobantesClient` from removed `comprobantes-client.js`, `PagosClient` from removed `pagos-client.js`, types from removed `articulo.js`, `comprobante.js`, `pago.js`
- sync-engine-metadata.test.ts (8 errors): imports `field-mappings-repo.js` (removed), mock query objects missing fields (`incrementalType`, `joinField`, `lastTestStatus`, `lastTestAt`, `lastTestRowCount`)
- repositories-query-based.test.ts (27 errors): imports `getDb` (not exported from store), `Database`/`drizzle`/`migrate` (unused), references `schema.fieldMappings` (removed from schema), `displayOrder`/`isScheduled` not in createQuery type
- integration-query-based-sync.test.ts (20 errors): same `getDb`/`fieldMappings`/`displayOrder`/`isScheduled` issues
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix API client TypeScript errors</name>
  <files>
    objetiva-sync/src/api-client/articulos-client.ts
    objetiva-sync/src/api-client/comprobantes-detalle-client.ts
    objetiva-sync/src/api-client/comprobantes-cabecera-client.ts
    objetiva-sync/src/api-client/comprobantes-pagos-client.ts
    objetiva-sync/src/api-client/auth.ts
  </files>
  <action>
Fix each file according to the specific errors identified:

**articulos-client.ts:**
1. Line 9: Remove `APIResponse` from the import (keep `BatchResult`): `import type { BatchResult } from '../types/common.js';`
2. Line 338: Add required fields to testConnection payload: `erp_codigo: 'TEST-001'` and `erp_nombre2: 'Articulo de prueba'`

**comprobantes-detalle-client.ts:**
1. Line 9: Remove `APIResponse` from the import (keep `BatchResult`): `import type { BatchResult } from '../types/common.js';`
2. Line 310: The template literal `${detalle?.erp_operacion}-${detalle?.erp_formulario}-${detalle?.erp_numero}-${detalle?.linea_numero}` is always a string, so `?? 'DETALLE_${i}'` is unreachable. Fix by using a conditional instead:
   ```typescript
   identifier: detalle
     ? `${detalle.erp_operacion}-${detalle.erp_formulario}-${detalle.erp_numero}-${detalle.linea_numero}`
     : `DETALLE_${i}`,
   ```
3. Line 325-332: Fix testConnection() payload to use correct IComprobanteDetallePayload fields. Replace `total: 100.0` with the actually required fields from the interface. Check `IComprobanteDetallePayload` for required fields (comprobante_operacion, comprobante_formulario, comprobante_numero, linea_numero, unidades are present; add the remaining required ones: precio_unitario, importe_bruto, importe_neto, alicuota_iva, importe_iva, importe_total -- remove `total`).

**comprobantes-cabecera-client.ts:**
1. Line 113: The response is cast as `APIResponse<BatchResult>` but then `data.data || data` creates a union type. Fix the 207 Multi-Status block by narrowing the type. Replace:
   ```typescript
   const data = (await response.json()) as APIResponse<BatchResult>;
   ```
   with:
   ```typescript
   const data = (await response.json()) as any;
   ```
   This matches the pattern used in articulos-client.ts and comprobantes-detalle-client.ts, which both use `as any` and work without type errors. The response shape varies between gateway versions, so `any` is pragmatic here.
2. Line 273: In validateBatch(), `comprobante?.comprobante` does not exist on `IComprobanteCabeceraPayload`. The identifier fields are `erp_operacion`, `erp_formulario`, `erp_numero`. Fix to:
   ```typescript
   identifier: comprobante ? `${comprobante.erp_operacion}-${comprobante.erp_formulario}-${comprobante.erp_numero}` : `COMPROBANTE_${i}`,
   ```
   Also change from `?? ` to ternary to avoid the same unreachable-?? issue.

**comprobantes-pagos-client.ts:**
1. Line 37: The `metadata` parameter in sendBatch is declared but never read for building headers (unlike other clients). Add the metadata header logic that exists in the other 3 clients (articulos, cabecera, detalle). Copy the pattern from articulos-client.ts lines 87-98:
   ```typescript
   if (metadata) {
     headers['X-Query-Id'] = metadata.queryId.toString();
     headers['X-Query-Name'] = metadata.queryName;
     if (metadata.syncId) {
       headers['X-Sync-Id'] = metadata.syncId;
     }
     if (metadata.batchNumber !== undefined && metadata.totalBatches !== undefined) {
       headers['X-Batch-Number'] = metadata.batchNumber.toString();
       headers['X-Total-Batches'] = metadata.totalBatches.toString();
     }
   }
   ```
   This must go between where `headers` is defined and where the fetch call is made.
2. Line 94: Same APIResponse cast issue as cabecera. Change `as APIResponse<BatchResult>` to `as any`.
3. Line 254: Same unreachable `??` fix as detalle. Change to ternary:
   ```typescript
   identifier: pago
     ? `${pago.erp_operacion}-${pago.erp_formulario}-${pago.erp_numero}`
     : `PAGO_${i}`,
   ```
4. Line 269: Fix testConnection() payload. `IComprobantePagosPayload` requires `comprobante_operacion`, `comprobante_formulario`, `comprobante_numero`, `linea_numero`. Check the actual type definition and add required fields.

**auth.ts:**
1. Lines 109-174: The `refreshAccessToken()` and `doRefreshToken()` methods are dead code -- the gateway doesn't support refresh tokens (login() sets `this.refreshToken = null`, and getToken() does re-login instead of refresh). Remove both methods entirely (lines 109-174). This eliminates: the unused method error (TS6133), the data.data property errors (TS2339 x4), and the null-assignable error (TS2322).
2. Alternatively, if you want to preserve the code for future use, prefix both methods with `// @ts-ignore` -- but removal is cleaner since getToken() already handles re-login.
  </action>
  <verify>
Run: `cd objetiva-sync && npx tsc --noEmit 2>&1 | grep "^src/api-client/"` -- should return zero lines.
  </verify>
  <done>All 31 TypeScript errors in src/api-client/ are resolved. No behavior change for articulos, detalle, cabecera clients. Pagos client now correctly sends metadata headers (feature parity with other clients). Dead refresh token code removed from auth.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Fix types/index.ts legacy re-exports and legacy test files</name>
  <files>
    objetiva-sync/src/types/index.ts
    objetiva-sync/src/__tests__/api-client-metadata.test.ts
    objetiva-sync/src/__tests__/sync-engine-metadata.test.ts
    objetiva-sync/src/__tests__/repositories-query-based.test.ts
    objetiva-sync/src/__tests__/integration-query-based-sync.test.ts
  </files>
  <action>
**types/index.ts (9 errors):**
The file re-exports from removed module names. Update ALL references:
- `./articulo.js` -> `./articulos.js`
- `./comprobante.js` -> replace with individual imports from `./comprobantes-cabecera.js` and `./comprobantes-detalle.js`
- `./pago.js` -> `./comprobantes-pagos.js`

Specific changes:
1. Line 13: `export * from './articulo.js'` -> `export * from './articulos.js'`
2. Line 16: `export * from './comprobante.js'` -> `export * from './comprobantes-cabecera.js'` and add `export * from './comprobantes-detalle.js'`
3. Line 19: `export * from './pago.js'` -> `export * from './comprobantes-pagos.js'`
4. Lines 47-51: Update the named type re-exports:
   ```typescript
   export type { IArticuloPayload, ArticuloPayload } from './articulos.js';
   ```
5. Lines 53-59: Update comprobante re-exports -- split into two:
   ```typescript
   export type { IComprobanteCabeceraPayload, ComprobanteCabeceraPayload } from './comprobantes-cabecera.js';
   export type { IComprobanteDetallePayload, ComprobanteDetallePayload } from './comprobantes-detalle.js';
   ```
   Note: Check actual exported type names in comprobantes-detalle.ts.
6. Lines 61-65: `IPagoPayload` and `PagoPayload` likely come from comprobantes-pagos.ts. Check the actual exported names: `IComprobantePagosPayload` is the interface. Adjust to match actual exports:
   ```typescript
   export type { IComprobantePagosPayload } from './comprobantes-pagos.js';
   ```
7. Lines 79-84: Update schema re-exports:
   ```typescript
   export { articuloPayloadSchema, articulosBatchSchema, isArticuloPayload } from './articulos.js';
   ```
8. Lines 86-93: Split comprobante schema re-exports:
   ```typescript
   export { comprobanteCabeceraPayloadSchema } from './comprobantes-cabecera.js';
   export { comprobanteDetallePayloadSchema } from './comprobantes-detalle.js';
   ```
   Note: `comprobantesBatchSchema`, `isComprobanteCabeceraPayload`, `isComprobanteDetallePayload` -- check if these exist in the current files. Only re-export what actually exists.
9. Lines 95-101: Update pago schema re-exports to comprobantes-pagos.js. Check actual exports from that file.

IMPORTANT: Before writing, read each target type file (articulos.ts, comprobantes-cabecera.ts, comprobantes-detalle.ts, comprobantes-pagos.ts) to verify the exact export names. Only re-export things that actually exist.

**__tests__/api-client-metadata.test.ts (5 errors):**
This test imports from removed modules. Fix imports:
1. Line 7: `ComprobantesClient` from `../api-client/comprobantes-client.js` -> `ComprobantesCabeceraClient` from `../api-client/comprobantes-cabecera-client.js`
2. Line 9: `PagosClient` from `../api-client/pagos-client.js` -> `ComprobantesPagosClient` from `../api-client/comprobantes-pagos-client.js`
3. Line 11: `IArticuloPayload` from `../types/articulo.js` -> from `../types/articulos.js`
4. Line 12: `IComprobanteCabeceraPayload, IComprobanteDetallePayload` from `../types/comprobante.js` -> from `../types/comprobantes-cabecera.js` and `../types/comprobantes-detalle.js` respectively
5. Line 13: `IPagoPayload` from `../types/pago.js` -> `IComprobantePagosPayload` from `../types/comprobantes-pagos.js`

Then update all usages in the test body:
- Line 124: `new ComprobantesClient(...)` -> `new ComprobantesCabeceraClient(...)`
- Line 209: `new PagosClient(...)` -> `new ComprobantesPagosClient(...)`
- Line 210: `IPagoPayload` -> `IComprobantePagosPayload`, update test payload to match interface (needs `erp_operacion`, `erp_formulario`, `erp_numero`, etc.)

**__tests__/sync-engine-metadata.test.ts (8 errors):**
1. Line 85 (and 209, 239): Remove mock of `../store/repositories/field-mappings-repo.js` if that module no longer exists. If it still exists but is renamed, update the import.
2. Lines 89, 180, 195, 242, 306: Mock query objects are missing fields. The `getQuery` return type now requires: `incrementalType`, `joinField`, `lastTestStatus`, `lastTestAt`, `lastTestRowCount`. Add these with null values to every mock query object:
   ```typescript
   incrementalType: null,
   joinField: null,
   lastTestStatus: null,
   lastTestAt: null,
   lastTestRowCount: null,
   ```

First check: Does `field-mappings-repo.js` still exist? Run `ls objetiva-sync/src/store/repositories/` to verify. If it doesn't exist, the vi.mock line must be removed and all FieldMappingsRepo usages must be replaced with the current mechanism (check how sync-engine gets field mappings now).

**__tests__/repositories-query-based.test.ts (27 errors):**
1. Lines 6-8: Remove unused imports: `Database`, `drizzle`, `migrate` (and `afterAll` from line 5)
2. Line 14: `getDb` not exported from store. Check how other test files get the db instance. If `initDatabase` returns the db, use that. Or check if there's a different export.
3. Line 28: `schema.fieldMappings` doesn't exist. Check current schema exports. If fieldMappings table was removed, remove the delete line.
4. Lines 40-43, 51, 71, 79, 87: `displayOrder` and `syncInterval` not in createQuery type. Check `createQuery`'s actual parameter type and adjust.
5. Lines 109, 118, 135: `isScheduled` not in createQuery type. Check if it's a different field name now.
6. Multiple `Object is possibly 'undefined'` errors: Add non-null assertions (`!`) to array index accesses like `queries[0]!.id`.

**__tests__/integration-query-based-sync.test.ts (20 errors):**
Same categories as repositories-query-based.test.ts:
1. `getDb` import, `schema.fieldMappings`, `displayOrder`, `initDatabase(':memory:')` parameter
2. `Object is possibly 'undefined'` errors on array accesses
3. Fix same patterns as above.

CRITICAL: For both repository test files, check the actual store/index.ts exports and store/schema.ts exports to understand what's available. Also check the actual QueriesRepo.createQuery parameter type.
  </action>
  <verify>
Run these commands in sequence:
1. `cd objetiva-sync && npx tsc --noEmit 2>&1 | grep "^src/types/index.ts"` -- should return zero lines
2. `cd objetiva-sync && npx tsc --noEmit 2>&1 | grep "^src/__tests__/"` -- should return zero lines
3. `cd objetiva-sync && npx vitest run src/__tests__/ --reporter=verbose 2>&1` -- tests should still pass (or were already broken, note the state)
  </verify>
  <done>
All 9 errors in types/index.ts resolved (re-exports point to current module names).
All 60 errors in src/__tests__/ resolved (imports updated, mock objects have correct fields, unused imports removed).
Tests in __tests__/ either pass or are documented as pre-existing failures (these test files were already broken before this plan -- they reference removed modules).
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Run `cd objetiva-sync && npx tsc --noEmit 2>&1 | grep -c "error TS"` to get remaining error count
2. Verify the remaining errors are ONLY in the out-of-scope files:
   - src/dashboard/routes/api/*.ts
   - src/sync/*.ts
   - src/services/gateway-client.ts
   - src/store/*.ts
3. Run `cd objetiva-sync && npx vitest run --reporter=verbose 2>&1` to verify no test regressions
</verification>

<success_criteria>
- Zero TypeScript errors in src/api-client/ (was 31)
- Zero TypeScript errors in src/types/index.ts (was 9)
- Zero TypeScript errors in src/__tests__/ (was 60)
- Total error count drops by ~100 (from 162 to ~62)
- No runtime behavior changes (except pagos-client now correctly sends metadata headers)
- Existing passing tests still pass
</success_criteria>

<output>
After completion, create `.planning/quick/001-fix-ts-errors-clean-test-imports/001-SUMMARY.md`
</output>
