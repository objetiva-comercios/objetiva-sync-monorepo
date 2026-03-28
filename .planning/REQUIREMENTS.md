# Requirements — Milestone v1.3: Distributed Schema Regeneration

**Defined:** 2026-03-28
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## Schema Regeneration

- [ ] **REGEN-01**: Operador puede correr el script de regeneracion desde Windows y obtener schemas actualizados de PostgreSQL via gateway remoto
- [ ] **REGEN-02**: Script genera archivos Zod en `shared/schemas/generated/` y Prisma en `prisma/schema.prisma` localmente, listos para commit
- [ ] **REGEN-03**: Script no requiere matar procesos, manejar DLL de Windows, ni acceso al filesystem del container Docker
- [ ] **REGEN-04**: Script muestra diff de cambios detectados antes de escribir archivos (dry-run disponible)

## Schema Status

- [ ] **SCHEMA-01**: Dashboard del gateway muestra pagina de Schema Status con todas las columnas, tipos, nullable, defaults y comentarios de cada entidad
- [ ] **SCHEMA-02**: Schema Status compara 3 niveles: PostgreSQL live vs schemas compilados en gateway vs schemas reportados por sync
- [ ] **SCHEMA-03**: Schema Status indica visualmente campos alineados (verde), desincronizados (rojo) y nuevos no propagados (amarillo)
- [ ] **SCHEMA-04**: Sync reporta su version de schemas al gateway via endpoint dedicado

## Sync Fixes

- [ ] **FIX-01**: Batches con respuesta 207 y 0 errores se cuentan como exitosos (no como fallidos)
- [ ] **FIX-02**: Flujo de deploy documentado: regenerar -> commit -> rebuild imagen -> prisma db push

## Future Requirements

None deferred.

## Out of Scope

- Regeneracion automatica de schemas sin intervencion del operador — control manual preferido
- Auto-actualizacion de los tipos manuales en objetiva-sync/src/types/*.ts — requiere revision humana
- Schema versioning o migration rollback — proyecto single-team, no necesario
- Regeneracion dentro del container Docker — archivos deben commitearse al repo

## Traceability

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| REGEN-01 | — | — | Pending |
| REGEN-02 | — | — | Pending |
| REGEN-03 | — | — | Pending |
| REGEN-04 | — | — | Pending |
| SCHEMA-01 | — | — | Pending |
| SCHEMA-02 | — | — | Pending |
| SCHEMA-03 | — | — | Pending |
| SCHEMA-04 | — | — | Pending |
| FIX-01 | — | — | Pending |
| FIX-02 | — | — | Pending |

---
*Created: 2026-03-28 — Milestone v1.3*
