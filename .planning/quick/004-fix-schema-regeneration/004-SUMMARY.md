---
phase: quick-004
plan: 01
subsystem: gateway-schemas
tags: [prisma, zod, codegen, schema-regeneration, postgresql]
dependency-graph:
  requires: [quick-001, quick-002, quick-003]
  provides: [regenerated-schemas, prisma-postgresql-sync, zero-ts-errors]
  affects: []
tech-stack:
  added: []
  patterns: [postgresql-source-of-truth, generated-schemas, prisma-relations]
key-files:
  created: []
  modified:
    - objetiva-sync-gateway/prisma/schema.prisma
    - objetiva-sync-gateway/shared/schemas/generated/articulos.generated.ts
    - objetiva-sync-gateway/shared/schemas/generated/comprobantes_cabecera.generated.ts
    - objetiva-sync-gateway/shared/schemas/generated/comprobantes_detalle.generated.ts
    - objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts
    - objetiva-sync-gateway/src/services/ingestion.ts
    - objetiva-sync-gateway/shared/schemas/comprobantes-pagos.ts
    - objetiva-sync/src/dashboard/routes/api/schema-info.ts
decisions:
  - id: Q004-D1
    decision: "Add Prisma relation fields manually after codegen"
    rationale: "Codegen introspects PostgreSQL columns but relations are Prisma-only (virtual fields). Must be added manually post-generation."
  - id: Q004-D2
    decision: "Remove erp_datos and activo from pagos legacy schema"
    rationale: "PostgreSQL comprobantes_pagos table does not have these columns. Keeping them would cause confusion."
  - id: Q004-D3
    decision: "Keep legacy cabecera schema as-is"
    rationale: "Not imported by any gateway src/ code. Generated schemas are source of truth via index.ts."
metrics:
  duration: ~6 minutes
  completed: 2026-02-05
  tasks: 3/3
---

# Quick Task 004: Fix Schema Regeneration Summary

**One-liner:** Regenerated Prisma + Zod schemas from PostgreSQL, fixed ingestion.ts field renames (metodo_pago->medio, updated_at->actualizado), achieved zero TS errors in both packages.

## What Was Done

### Task 1: Run schema regeneration and Prisma generate
- Ran `npm run regenerate-schemas` which introspected PostgreSQL and regenerated:
  - `prisma/schema.prisma` -- full Prisma model definitions from live DB
  - 4 generated Zod schemas in `shared/schemas/generated/`
- Codegen correctly skipped 2 stale indexes (periodo on cabecera, metodo_pago on pagos)
- Prisma generate initially failed due to missing relation fields (codegen doesn't generate these)
- Manually added `comprobante` relation fields to ComprobanteDetalle and ComprobantePagos models
- Re-ran `npx prisma generate` successfully after stopping gateway (file lock on DLL)
- Commit: `a1d6223`

### Task 2: Fix all gateway TypeScript errors
- 6 TS errors all in `src/services/ingestion.ts`, all about `metodo_pago` property not existing
- Fixed all 4 code paths in `ingestComprobantesPagos`:
  - **createMany bulk**: `pago.metodo_pago || pago.medio` -> `pago.medio`; `metodo_pago:` -> `medio:`
  - **individual create fallback**: same field renames
  - **transaction update**: same field renames + `updated_at` -> `actualizado`
  - **individual update fallback**: same field renames + `updated_at` -> `actualizado`
- Updated error message strings to remove `pago.metodo_pago` references
- Updated legacy `comprobantes-pagos.ts`: removed `metodo_pago` field, made `medio` required, removed `erp_datos`/`activo`, removed refine
- Commit: `e5e677a`

### Task 3: Fix sync-side stale references
- `npx tsc --noEmit` in objetiva-sync already passed with 0 errors (sync uses `medio` natively)
- Updated `schema-info.ts` description maps:
  - `metodo_pago` description notes it's renamed to `medio` in PostgreSQL
  - `created_at`/`updated_at` descriptions note rename to `creado`/`actualizado`
  - Added `creado` and `actualizado` to both description and example maps
- Commit: `f4ed31a`

## Key Schema Changes from PostgreSQL

### comprobantes_pagos
| Old Field | New Field | Change |
|-----------|-----------|--------|
| metodo_pago | medio | Column rename |
| created_at | creado | Column rename |
| updated_at | actualizado | Column rename |
| erp_datos | (removed) | Column dropped |
| activo | (removed) | Column dropped |

### comprobantes_cabecera
| Old Field | New Field | Change |
|-----------|-----------|--------|
| periodo | (removed) | Column dropped |
| subtotal | (removed) | Column dropped |
| total_impuestos | (removed) | Column dropped |
| total (Decimal) | total_venta (Decimal) | Rename |
| tercero_datos (Json NOT NULL) | tercero_datos (Json? nullable) | Nullability change |
| erp_operacion (nullable) | erp_operacion (NOT NULL) | Nullability change |
| erp_formulario (nullable) | erp_formulario (NOT NULL) | Nullability change |
| erp_numero (nullable) | erp_numero (NOT NULL) | Nullability change |

### comprobantes_pagos (Prisma)
- cheque_fecha_diferida changed from Timestamptz to Date
- fecha_vencimiento changed from Timestamptz to Date
- tarjeta_cuotas now has @default(1)
- tarjeta_recargo now has @default(0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma relation fields missing from generated schema**
- **Found during:** Task 1
- **Issue:** The codegen script regenerates models from PostgreSQL column metadata but doesn't include Prisma relation annotations (virtual fields not in DB)
- **Fix:** Manually added `comprobante ComprobanteCabecera? @relation(...)` to ComprobanteDetalle and ComprobantePagos models
- **Files modified:** `prisma/schema.prisma`
- **Commit:** `a1d6223`

**2. [Rule 3 - Blocking] Prisma generate file lock (gateway holding DLL)**
- **Found during:** Task 1
- **Issue:** `npx prisma generate` got EPERM error because the running gateway had a lock on `query_engine-windows.dll.node`
- **Fix:** Killed gateway process via `node scripts/kill-gateway-process.mjs`, then re-ran prisma generate
- **Commit:** `a1d6223`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` in gateway | 0 errors |
| `npx tsc --noEmit` in sync | 0 errors |
| `metodo_pago` in prisma/schema.prisma | 0 occurrences |
| `metodo_pago` in generated pagos schema | 0 occurrences |
| `metodo_pago` in ingestion.ts | 0 occurrences |
| `created_at`/`updated_at` in prisma schema | 0 occurrences |

## Success Criteria

- [x] Schema regeneration pipeline runs end-to-end without errors
- [x] Prisma schema matches PostgreSQL source of truth
- [x] Generated Zod schemas match PostgreSQL source of truth
- [x] Zero TypeScript errors in objetiva-sync-gateway
- [x] Zero TypeScript errors in objetiva-sync
- [x] ingestion.ts uses `medio` (not `metodo_pago`) for Prisma writes
- [x] ingestion.ts uses `actualizado` (not `updated_at`) for Prisma writes
