/**
 * Unit Tests: sync-schema-store (Phase 26, Plan 00)
 *
 * Tests all behaviors of the in-memory sync schema store:
 * - set() stores schemas and get() retrieves by entity name
 * - set() clears previous data before storing (full overwrite)
 * - get() returns null for unknown entity
 * - hasData() returns false initially, true after set()
 * - _resetForTest() clears all data for test isolation
 *
 * NOTE: These tests will FAIL at import time because the production module
 * does not exist yet. This is expected RED phase behavior (Wave 0).
 * Tests will pass once Plan 01 creates src/services/sync-schema-store.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { syncSchemaStore } from '../../src/services/sync-schema-store.js'
import type { TableSchemaMetadata } from '../../../../shared/types/schema-metadata.js'

// ────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────

const articulosFixture: TableSchemaMetadata = {
  entity: 'articulos',
  columns: [
    {
      column_name: 'id',
      data_type: 'integer',
      is_nullable: false,
      default_value: null,
    },
    {
      column_name: 'nombre',
      data_type: 'text',
      is_nullable: true,
      default_value: null,
    },
  ],
  constraints: [
    {
      constraint_name: 'articulos_pkey',
      constraint_type: 'PRIMARY KEY',
      columns: ['id'],
    },
  ],
}

const otherFixture: TableSchemaMetadata = {
  entity: 'comprobantes_cabecera',
  columns: [
    {
      column_name: 'id',
      data_type: 'integer',
      is_nullable: false,
      default_value: null,
    },
  ],
  constraints: [],
}

// ────────────────────────────────────────────────────────────────
// Test isolation
// ────────────────────────────────────────────────────────────────

beforeEach(() => {
  syncSchemaStore._resetForTest()
})

// ────────────────────────────────────────────────────────────────
// set() and get()
// ────────────────────────────────────────────────────────────────

describe('set() and get()', () => {
  it('set() stores schemas and get() retrieves by entity name', () => {
    syncSchemaStore.set([articulosFixture])

    const result = syncSchemaStore.get('articulos')

    expect(result).not.toBeNull()
    expect(result!.entity).toBe('articulos')
    expect(result!.columns).toHaveLength(2)
    expect(result!.columns[0].column_name).toBe('id')
    expect(result!.columns[0].data_type).toBe('integer')
    expect(result!.columns[0].is_nullable).toBe(false)
    expect(result!.columns[1].column_name).toBe('nombre')
    expect(result!.constraints).toHaveLength(1)
    expect(result!.constraints[0].constraint_type).toBe('PRIMARY KEY')
  })

  it('set() clears previous data before storing — calling set() twice replaces first snapshot', () => {
    syncSchemaStore.set([articulosFixture])
    // Second call with different entity — articulos should be gone
    syncSchemaStore.set([otherFixture])

    const articulos = syncSchemaStore.get('articulos')
    expect(articulos).toBeNull()

    const other = syncSchemaStore.get('comprobantes_cabecera')
    expect(other).not.toBeNull()
    expect(other!.entity).toBe('comprobantes_cabecera')
  })

  it('get() returns null for unknown entity', () => {
    syncSchemaStore.set([articulosFixture])

    const result = syncSchemaStore.get('nonexistent')

    expect(result).toBeNull()
  })

  it('get() returns null when store is empty', () => {
    const result = syncSchemaStore.get('articulos')

    expect(result).toBeNull()
  })

  it('set() can store multiple entities at once and all are retrievable', () => {
    syncSchemaStore.set([articulosFixture, otherFixture])

    expect(syncSchemaStore.get('articulos')).not.toBeNull()
    expect(syncSchemaStore.get('comprobantes_cabecera')).not.toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────
// hasData()
// ────────────────────────────────────────────────────────────────

describe('hasData()', () => {
  it('returns false initially before any set() call', () => {
    expect(syncSchemaStore.hasData()).toBe(false)
  })

  it('returns true after set() with at least one schema', () => {
    syncSchemaStore.set([articulosFixture])

    expect(syncSchemaStore.hasData()).toBe(true)
  })

  it('returns false after _resetForTest() clears the store', () => {
    syncSchemaStore.set([articulosFixture])
    syncSchemaStore._resetForTest()

    expect(syncSchemaStore.hasData()).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────
// _resetForTest()
// ────────────────────────────────────────────────────────────────

describe('_resetForTest()', () => {
  it('clears all stored schemas — get() returns null after reset', () => {
    syncSchemaStore.set([articulosFixture, otherFixture])
    expect(syncSchemaStore.hasData()).toBe(true)

    syncSchemaStore._resetForTest()

    expect(syncSchemaStore.get('articulos')).toBeNull()
    expect(syncSchemaStore.get('comprobantes_cabecera')).toBeNull()
    expect(syncSchemaStore.hasData()).toBe(false)
  })

  it('is idempotent — calling multiple times does not throw', () => {
    syncSchemaStore._resetForTest()
    syncSchemaStore._resetForTest()
    syncSchemaStore._resetForTest()
  })

  it('allows re-population after reset', () => {
    syncSchemaStore.set([articulosFixture])
    syncSchemaStore._resetForTest()

    // Re-populate
    syncSchemaStore.set([otherFixture])

    expect(syncSchemaStore.get('articulos')).toBeNull()
    expect(syncSchemaStore.get('comprobantes_cabecera')).not.toBeNull()
    expect(syncSchemaStore.hasData()).toBe(true)
  })
})
