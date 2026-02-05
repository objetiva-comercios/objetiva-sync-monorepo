---
phase: quick-004
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - objetiva-sync-gateway/prisma/schema.prisma
  - objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts
  - objetiva-sync-gateway/shared/schemas/generated/comprobantes_cabecera.generated.ts
  - objetiva-sync-gateway/shared/schemas/generated/comprobantes_detalle.generated.ts
  - objetiva-sync-gateway/shared/schemas/generated/articulos.generated.ts
  - objetiva-sync-gateway/src/services/ingestion.ts
  - objetiva-sync-gateway/shared/schemas/comprobantes-pagos.ts
  - objetiva-sync-gateway/shared/schemas/comprobantes-cabecera.ts
  - objetiva-sync/src/dashboard/routes/api/schema-info.ts
autonomous: true

must_haves:
  truths:
    - "Schema regeneration completes without errors"
    - "Prisma client regenerates successfully from new schema"
    - "Gateway compiles with zero TypeScript errors (npx tsc --noEmit)"
    - "Sync compiles with zero TypeScript errors (npx tsc --noEmit)"
  artifacts:
    - path: "objetiva-sync-gateway/prisma/schema.prisma"
      provides: "Prisma schema matching PostgreSQL exactly"
      contains: "medio"
    - path: "objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts"
      provides: "Regenerated Zod schema with medio instead of metodo_pago"
    - path: "objetiva-sync-gateway/src/services/ingestion.ts"
      provides: "Ingestion service with corrected field names"
  key_links:
    - from: "objetiva-sync-gateway/src/services/ingestion.ts"
      to: "prisma.comprobantePagos"
      via: "Prisma client field names"
      pattern: "medio.*EFECTIVO"
---

<objective>
Fix schema regeneration pipeline end-to-end: run the regeneration (codegen bug already fixed), then fix all downstream TypeScript compilation errors caused by schema changes.

Purpose: PostgreSQL is the source of truth. The current Prisma schema and generated Zod schemas are stale and do not match PostgreSQL. After regeneration, field renames/removals will cause TS errors that must be fixed.

Output: Zero TypeScript errors in both gateway and sync packages, with schemas matching PostgreSQL exactly.
</objective>

<execution_context>
@C:\Users\sistemas\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\sistemas\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@objetiva-sync-gateway/prisma/schema.prisma
@objetiva-sync-gateway/src/services/ingestion.ts
@objetiva-sync-gateway/shared/schemas/index.ts
@objetiva-sync-gateway/shared/schemas/comprobantes-pagos.ts
@objetiva-sync-gateway/shared/schemas/comprobantes-cabecera.ts
@objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts
@objetiva-sync-gateway/shared/schemas/generated/comprobantes_cabecera.generated.ts
@objetiva-sync/src/types/comprobantes-pagos.ts
@objetiva-sync/src/dashboard/routes/api/schema-info.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run schema regeneration and Prisma generate</name>
  <files>
    objetiva-sync-gateway/prisma/schema.prisma
    objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts
    objetiva-sync-gateway/shared/schemas/generated/comprobantes_cabecera.generated.ts
    objetiva-sync-gateway/shared/schemas/generated/comprobantes_detalle.generated.ts
    objetiva-sync-gateway/shared/schemas/generated/articulos.generated.ts
  </files>
  <action>
    Run the schema regeneration pipeline in objetiva-sync-gateway/:

    1. Run `npm run regenerate-schemas` in `objetiva-sync-gateway/`
       - This introspects PostgreSQL and regenerates:
         - `prisma/schema.prisma` (from PostgreSQL metadata)
         - `shared/schemas/generated/*.generated.ts` (Zod schemas from PostgreSQL metadata)
       - The codegen bug in `prisma-generator.ts` lines 342-370 has ALREADY been fixed
       - This command should succeed now (stale @@index fields are filtered out)

    2. Run `npx prisma generate` in `objetiva-sync-gateway/`
       - This regenerates the Prisma client from the new schema
       - Required before TypeScript can compile against new field names

    3. Inspect the regenerated files to understand EXACTLY what changed:
       - Read the new `prisma/schema.prisma` and compare to current
       - Read the new `shared/schemas/generated/comprobantes_pagos.generated.ts`
       - Read the new `shared/schemas/generated/comprobantes_cabecera.generated.ts`
       - Note every field rename, removal, nullability change, and new field

    IMPORTANT: If `npm run regenerate-schemas` fails, check the error output carefully.
    The DATABASE_URL env var must be set (check .env file in objetiva-sync-gateway/).
    If it's a connection error, this is a blocker -- report and stop.
  </action>
  <verify>
    - `npm run regenerate-schemas` exits with code 0
    - `npx prisma generate` exits with code 0
    - `prisma/schema.prisma` has been modified (check git diff)
    - `shared/schemas/generated/*.generated.ts` files have been modified
  </verify>
  <done>
    Regenerated Prisma schema and Zod schemas match PostgreSQL exactly.
    Prisma client is regenerated and ready for compilation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix all gateway TypeScript errors from schema changes</name>
  <files>
    objetiva-sync-gateway/src/services/ingestion.ts
    objetiva-sync-gateway/shared/schemas/comprobantes-pagos.ts
    objetiva-sync-gateway/shared/schemas/comprobantes-cabecera.ts
  </files>
  <action>
    Run `npx tsc --noEmit` in `objetiva-sync-gateway/` to find all TS errors. Fix every error.

    KNOWN CHANGES (from PostgreSQL source of truth). Apply these fixes based on what the regenerated schema actually contains. The executor MUST read the regenerated files first, then apply the correct mappings. The following are EXPECTED changes based on what the user reported:

    **A. `src/services/ingestion.ts` -- `ingestComprobantesPagos` method:**

    The `ComprobantePagosInput` type comes from generated Zod schema. After regeneration:
    - `metodo_pago` is GONE from the type. The PostgreSQL column is now `medio`.
    - `created_at` is GONE. PostgreSQL column is now `creado`.
    - `updated_at` is GONE. PostgreSQL column is now `actualizado`.
    - `erp_datos` may be GONE (not in PostgreSQL).
    - `activo` may be GONE (not in PostgreSQL).

    Specific fixes in `ingestComprobantesPagos`:

    1. **Lines ~792, 810, 853, 874** -- Replace `pago.metodo_pago || pago.medio` with just `pago.medio` (metodo_pago no longer exists on the type). The fallback logic becomes:
       ```typescript
       const medio_normalizado = pago.medio || 'EFECTIVO'
       ```

    2. **Lines ~795, 814, 858, 879** -- Replace `metodo_pago: metodo_pago_normalizado` with `medio: medio_normalizado` in the Prisma data object (the Prisma field is now `medio`, not `metodo_pago`).

    3. **Lines ~862, 883** -- Replace `updated_at: new Date()` with `actualizado: new Date()` in the Prisma update calls (the Prisma field is now `actualizado`).

    4. **Lines ~835, 901** -- Error message strings: Replace `pago.medio || pago.metodo_pago` with just `pago.medio`.

    5. The spread `...pago` may include fields that no longer exist in Prisma (e.g., `erp_datos`, `activo`). If these fields are in the Zod input but NOT in Prisma, the `nullToUndefined` spread will pass them through and Prisma will reject unknown fields. Check if the generated Zod schema still includes them. If the Zod schema dropped them (because PostgreSQL dropped them), no issue. If the Zod schema still has them but Prisma does not, destructure to exclude: `const { erp_datos, activo, ...pagoData } = pago` before spreading.

    **B. `src/services/ingestion.ts` -- `ingestComprobantesCabecera` method:**

    After regeneration, the `ComprobanteCabeceraInput` type may change:
    - `periodo` removed (not in PostgreSQL) -- if the Zod schema drops it, any reference breaks
    - `subtotal` removed -- same
    - `total_impuestos` removed -- same
    - `total` removed -- same
    - `erp_operacion`, `erp_formulario`, `erp_numero` may become NOT NULL
    - `tercero_datos` may become nullable

    The cabecera ingestion code (lines ~274-476) currently spreads `...c` / `...comp` / `...data`. If removed fields were in the old type but are NOT in the new Prisma model, the spread will fail. Check:
    - Does the code explicitly reference `periodo`, `subtotal`, `total_impuestos`, `total`? (grep confirms: NO, these are not explicitly referenced in ingestion.ts)
    - The spread `...comp` will just pass whatever the Zod schema provides. If Zod drops the fields (because PostgreSQL dropped them), no issue.

    **C. `shared/schemas/comprobantes-pagos.ts` (manual/legacy schema):**

    This file has `metodo_pago` and `activo` and `erp_datos` fields. Even though it's "deprecated" (index.ts uses generated schemas), it should still be consistent:
    - Rename `metodo_pago` to `medio` (make it the primary field, not an alias)
    - Remove the `.refine()` that checks `data.medio || data.metodo_pago` -- just require `medio`
    - Remove `erp_datos` and `activo` if PostgreSQL dropped them
    - OR: Mark this file clearly as legacy and leave it (since index.ts doesn't use it). Prefer removing dead code.

    **D. `shared/schemas/comprobantes-cabecera.ts` (manual/legacy schema):**

    Similar -- if `periodo`, `subtotal`, `total_impuestos`, `total` don't exist in PostgreSQL, remove them from this legacy schema to avoid confusion. OR leave with a clear deprecation note.

    **APPROACH:** Read the actual regenerated files first. Then run `npx tsc --noEmit` to get the exact error list. Fix each error. Do NOT guess -- use the compiler output.

    After fixing all errors, run `npx tsc --noEmit` again to verify zero errors.
  </action>
  <verify>
    `npx tsc --noEmit` in `objetiva-sync-gateway/` exits with code 0 (zero errors)
  </verify>
  <done>
    All gateway TypeScript compilation errors are fixed. Code uses correct field names matching PostgreSQL.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix sync-side TypeScript errors and stale references</name>
  <files>
    objetiva-sync/src/dashboard/routes/api/schema-info.ts
    objetiva-sync/src/types/comprobantes-pagos.ts
  </files>
  <action>
    The objetiva-sync package has its OWN Zod schemas in `src/types/` that are used by API clients.
    These schemas define what the SYNC CLIENT sends to the gateway. They must be compatible with what the gateway accepts.

    1. Run `npx tsc --noEmit` in `objetiva-sync/` to check current state.

    2. Check `objetiva-sync/src/types/comprobantes-pagos.ts`:
       - This file defines `IComprobantePagosPayload` and `comprobantePagoPayloadSchema`
       - It already uses `medio` as the primary field name (line 23: `medio: string`)
       - It also has `erp_datos` (line 32) -- but the gateway Zod schema may no longer accept this field
       - If the gateway generated schema dropped `erp_datos`, this field will be silently ignored by the gateway (it goes through Zod parse which strips unknown fields). This is OK for now but should be noted.
       - No changes likely needed here -- the sync client sends `medio` which the gateway now expects.

    3. Check `objetiva-sync/src/dashboard/routes/api/schema-info.ts`:
       - Line 254: Has `'metodo_pago': 'Metodo de pago utilizado'` -- this is a UI description map
       - Lines 291-292: Has `'created_at'` and `'updated_at'` descriptions
       - These are display strings, not type-checked. They won't cause TS errors but should be updated for accuracy:
         - Remove or comment out `metodo_pago` entry (the field is now `medio`)
         - Change `created_at` to `creado` and `updated_at` to `actualizado`

    4. Run `npx tsc --noEmit` again in `objetiva-sync/` to verify zero errors.

    IMPORTANT: The sync package's types are what the SYNC CLIENT sends. The gateway is what RECEIVES and validates.
    - Sync sends: `{ medio: "EFECTIVO", ... }` -- this is CORRECT
    - Gateway Zod validates: `medio: z.string()` -- this is CORRECT after regeneration
    - No breaking change on the wire protocol

    If `npx tsc --noEmit` in objetiva-sync/ reveals errors unrelated to this schema change, note them but focus only on schema-related errors.
  </action>
  <verify>
    `npx tsc --noEmit` in `objetiva-sync/` exits with code 0 (zero errors)
  </verify>
  <done>
    Both gateway and sync compile cleanly. Schema-info dashboard descriptions updated to match PostgreSQL field names.
  </done>
</task>

</tasks>

<verification>
1. `cd objetiva-sync-gateway && npx tsc --noEmit` -- exits 0
2. `cd objetiva-sync && npx tsc --noEmit` -- exits 0
3. `git diff objetiva-sync-gateway/prisma/schema.prisma` -- shows regenerated schema
4. Verify `metodo_pago` does NOT appear in:
   - `objetiva-sync-gateway/prisma/schema.prisma`
   - `objetiva-sync-gateway/shared/schemas/generated/comprobantes_pagos.generated.ts`
   - `objetiva-sync-gateway/src/services/ingestion.ts` (as a Prisma field write)
5. Verify `created_at`/`updated_at` do NOT appear in the Prisma comprobantes_pagos model
</verification>

<success_criteria>
- Schema regeneration pipeline runs end-to-end without errors
- Prisma schema matches PostgreSQL source of truth
- Generated Zod schemas match PostgreSQL source of truth
- Zero TypeScript errors in objetiva-sync-gateway (npx tsc --noEmit)
- Zero TypeScript errors in objetiva-sync (npx tsc --noEmit)
- ingestion.ts uses `medio` (not `metodo_pago`) for Prisma writes
- ingestion.ts uses `actualizado` (not `updated_at`) for Prisma writes
</success_criteria>

<output>
After completion, create `.planning/quick/004-fix-schema-regeneration/004-SUMMARY.md`
</output>
