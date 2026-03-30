/**
 * Unit Tests: schema-comparison (Phase 26, Plan 00)
 *
 * Tests pure comparison logic for the 3-way schema comparison feature.
 * Covers all status values: aligned, mismatched, missing, not_reported,
 * and summary counts.
 *
 * Decisions from 26-RESEARCH.md:
 * - D-07: Per-field structure { column_name, status, postgresql, compiled, sync }
 * - D-08: status values: "aligned", "mismatched", "missing"
 * - D-09: Comparison attributes: data_type + is_nullable only
 * - D-10: Entity includes summary: { aligned: N, mismatched: N, missing: N }
 *
 * NOTE: These tests will FAIL at import time because the production module
 * does not exist yet. This is expected RED phase behavior (Wave 0).
 * Tests will pass once Plan 01 creates src/services/schema-comparison.ts.
 */

import { describe, it, expect } from 'vitest'
import { buildEntityComparison } from '../../src/services/schema-comparison.js'
import type { TableSchemaMetadata } from '../../../../shared/types/schema-metadata.js'

// ────────────────────────────────────────────────────────────────
// Fixture Helpers
// ────────────────────────────────────────────────────────────────

/** Creates a minimal TableSchemaMetadata for testing */
function makeSchema(
  entity: string,
  columns: Array<{ column_name: string; data_type: string; is_nullable: boolean }>
): TableSchemaMetadata {
  return {
    entity,
    columns: columns.map(c => ({
      column_name: c.column_name,
      data_type: c.data_type,
      is_nullable: c.is_nullable,
      default_value: null,
    })),
    constraints: [],
  }
}

/** Creates a single-column schema for concise tests */
function schemaWithColumn(
  entity: string,
  columnName: string,
  dataType: string,
  isNullable: boolean
): TableSchemaMetadata {
  return makeSchema(entity, [{ column_name: columnName, data_type: dataType, is_nullable: isNullable }])
}

// ────────────────────────────────────────────────────────────────
// aligned status
// ────────────────────────────────────────────────────────────────

describe('aligned status', () => {
  it('returns "aligned" when PostgreSQL, compiled, and sync all match on data_type + is_nullable', () => {
    const pgSchema = schemaWithColumn('articulos', 'id', 'integer', false)
    const compiledSchema = schemaWithColumn('articulos', 'id', 'integer', false)
    const syncSchema = schemaWithColumn('articulos', 'id', 'integer', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.entity).toBe('articulos')
    expect(result.sync_reported).toBe(true)
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].column_name).toBe('id')
    expect(result.fields[0].status).toBe('aligned')
    expect(result.fields[0].postgresql).toEqual({ data_type: 'integer', is_nullable: false })
    expect(result.fields[0].compiled).toEqual({ data_type: 'integer', is_nullable: false })
    expect(result.fields[0].sync).toEqual({ data_type: 'integer', is_nullable: false })
    expect(result.summary).toEqual({ aligned: 1, mismatched: 0, missing: 0 })
  })
})

// ────────────────────────────────────────────────────────────────
// mismatched status
// ────────────────────────────────────────────────────────────────

describe('mismatched status', () => {
  it('returns "mismatched" when compiled data_type differs from PostgreSQL', () => {
    const pgSchema = schemaWithColumn('articulos', 'precio', 'numeric', false)
    const compiledSchema = schemaWithColumn('articulos', 'precio', 'text', false)
    const syncSchema = schemaWithColumn('articulos', 'precio', 'numeric', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.fields[0].column_name).toBe('precio')
    expect(result.fields[0].status).toBe('mismatched')
    expect(result.fields[0].postgresql).toEqual({ data_type: 'numeric', is_nullable: false })
    expect(result.fields[0].compiled).toEqual({ data_type: 'text', is_nullable: false })
    expect(result.summary.mismatched).toBe(1)
    expect(result.summary.aligned).toBe(0)
  })

  it('returns "mismatched" when compiled is_nullable differs from PostgreSQL', () => {
    const pgSchema = schemaWithColumn('articulos', 'nombre', 'text', true)
    const compiledSchema = schemaWithColumn('articulos', 'nombre', 'text', false)
    const syncSchema = schemaWithColumn('articulos', 'nombre', 'text', true)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.fields[0].column_name).toBe('nombre')
    expect(result.fields[0].status).toBe('mismatched')
    expect(result.fields[0].postgresql).toEqual({ data_type: 'text', is_nullable: true })
    expect(result.fields[0].compiled).toEqual({ data_type: 'text', is_nullable: false })
    expect(result.summary.mismatched).toBe(1)
  })

  it('returns "mismatched" when sync data_type differs from PostgreSQL', () => {
    const pgSchema = schemaWithColumn('articulos', 'codigo', 'integer', false)
    const compiledSchema = schemaWithColumn('articulos', 'codigo', 'integer', false)
    const syncSchema = schemaWithColumn('articulos', 'codigo', 'text', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.fields[0].status).toBe('mismatched')
    expect(result.summary.mismatched).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────
// missing status
// ────────────────────────────────────────────────────────────────

describe('missing status', () => {
  it('returns "missing" when field exists in PostgreSQL but is absent from compiled', () => {
    const pgSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nuevo_campo', data_type: 'text', is_nullable: true },
    ])
    // compiled does NOT have nuevo_campo
    const compiledSchema = schemaWithColumn('articulos', 'id', 'integer', false)
    const syncSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nuevo_campo', data_type: 'text', is_nullable: true },
    ])

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    const nuevoField = result.fields.find(f => f.column_name === 'nuevo_campo')
    expect(nuevoField).toBeDefined()
    expect(nuevoField!.status).toBe('missing')
    expect(nuevoField!.postgresql).not.toBeNull()
    expect(nuevoField!.compiled).toBeNull()
    expect(result.summary.missing).toBeGreaterThanOrEqual(1)
  })

  it('returns "missing" when field exists in PostgreSQL and compiled but is absent from sync (syncReported=true)', () => {
    const pgSchema = schemaWithColumn('articulos', 'campo_x', 'text', false)
    const compiledSchema = schemaWithColumn('articulos', 'campo_x', 'text', false)
    // sync does NOT have campo_x
    const syncSchema = schemaWithColumn('articulos', 'id', 'integer', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    const campoXField = result.fields.find(f => f.column_name === 'campo_x')
    expect(campoXField).toBeDefined()
    expect(campoXField!.status).toBe('missing')
    expect(campoXField!.postgresql).not.toBeNull()
    expect(campoXField!.compiled).not.toBeNull()
    expect(campoXField!.sync).toBeNull()
    expect(result.summary.missing).toBeGreaterThanOrEqual(1)
  })
})

// ────────────────────────────────────────────────────────────────
// not_reported state (syncReported=false)
// ────────────────────────────────────────────────────────────────

describe('not_reported state (syncReported=false)', () => {
  it('fields that match PG+compiled show "aligned" (2-way) when sync not reported', () => {
    const pgSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])
    const compiledSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])

    // syncSchema not relevant when syncReported=false
    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, null, false)

    expect(result.sync_reported).toBe(false)
    expect(result.fields).toHaveLength(2)

    for (const field of result.fields) {
      expect(field.status).toBe('aligned')
      expect(field.sync).toBeNull()
    }

    expect(result.summary).toEqual({ aligned: 2, mismatched: 0, missing: 0 })
  })

  it('sync is null for each field row when syncReported=false', () => {
    const pgSchema = schemaWithColumn('articulos', 'id', 'integer', false)
    const compiledSchema = schemaWithColumn('articulos', 'id', 'integer', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, null, false)

    expect(result.fields[0].sync).toBeNull()
    expect(result.sync_reported).toBe(false)
  })

  it('entity-level sync_reported is false when syncReported=false', () => {
    const pgSchema = schemaWithColumn('articulos', 'id', 'integer', false)
    const compiledSchema = schemaWithColumn('articulos', 'id', 'integer', false)

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, null, false)

    expect(result.sync_reported).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────
// summary counts
// ────────────────────────────────────────────────────────────────

describe('summary counts', () => {
  it('counts 1 aligned, 1 mismatched, 1 missing across 3 fields', () => {
    const pgSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },      // aligned
      { column_name: 'precio', data_type: 'numeric', is_nullable: false },   // mismatched (compiled has 'text')
      { column_name: 'nuevo_campo', data_type: 'text', is_nullable: true },  // missing from compiled
    ])
    const compiledSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },       // aligned
      { column_name: 'precio', data_type: 'text', is_nullable: false },      // mismatched
      // nuevo_campo absent — triggers missing
    ])
    const syncSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'precio', data_type: 'numeric', is_nullable: false },
      { column_name: 'nuevo_campo', data_type: 'text', is_nullable: true },
    ])

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.summary.aligned).toBe(1)
    expect(result.summary.mismatched).toBe(1)
    expect(result.summary.missing).toBe(1)
    expect(result.fields).toHaveLength(3)
  })

  it('all aligned summary when all 3 layers fully match', () => {
    const pgSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])
    const compiledSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])
    const syncSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])

    const result = buildEntityComparison('articulos', pgSchema, compiledSchema, syncSchema, true)

    expect(result.summary).toEqual({ aligned: 2, mismatched: 0, missing: 0 })
  })
})

// ────────────────────────────────────────────────────────────────
// null pgSchema (introspection failed)
// ────────────────────────────────────────────────────────────────

describe('null pgSchema (introspection failed)', () => {
  it('all fields from compiled have postgresql: null and status "missing" when pgSchema is null', () => {
    const compiledSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
      { column_name: 'nombre', data_type: 'text', is_nullable: true },
    ])
    const syncSchema = makeSchema('articulos', [
      { column_name: 'id', data_type: 'integer', is_nullable: false },
    ])

    const result = buildEntityComparison('articulos', null, compiledSchema, syncSchema, true)

    expect(result.entity).toBe('articulos')
    // When PG introspection fails, every field should be "missing" (PG is null)
    for (const field of result.fields) {
      expect(field.postgresql).toBeNull()
      expect(field.status).toBe('missing')
    }
    expect(result.summary.missing).toBeGreaterThan(0)
    expect(result.summary.aligned).toBe(0)
  })

  it('returns entity result (not null/undefined) even when pgSchema is null', () => {
    const compiledSchema = schemaWithColumn('articulos', 'id', 'integer', false)

    const result = buildEntityComparison('articulos', null, compiledSchema, null, false)

    expect(result).toBeDefined()
    expect(result.entity).toBe('articulos')
    expect(Array.isArray(result.fields)).toBe(true)
    expect(typeof result.summary).toBe('object')
    expect(typeof result.sync_reported).toBe('boolean')
  })
})
