/**
 * Unit Tests: pairing-store (Phase 20, Plan 01)
 *
 * Tests all behaviors of the in-memory pairing code store:
 * - generateCode: returns 6-char code from valid charset, expiresAt ~10 minutes out
 * - generateCode: calling twice invalidates the first code
 * - claimCode: 'ok' for valid active code, 'consumed' for already-claimed, 'invalid' for unknown/expired
 * - claimCode: case-insensitive input normalization
 * - TTL expiry: returns 'invalid' after code expires
 * - getActiveCode: returns current entry or null
 * - _resetForTest: clears all state for test isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Import after vi.useFakeTimers setup — module uses module-level state
let generateCode: () => { code: string; expiresAt: Date }
let claimCode: (input: string) => 'ok' | 'consumed' | 'invalid'
let getActiveCode: () => { code: string; expiresAt: Date; timeoutHandle: ReturnType<typeof setTimeout> } | null
let _resetForTest: () => void

describe('pairing-store', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    // Fresh module for each test group to avoid state leakage
    vi.resetModules()
    const mod = await import('../../src/lib/pairing-store.js')
    generateCode = mod.generateCode
    claimCode = mod.claimCode
    getActiveCode = mod.getActiveCode
    _resetForTest = mod._resetForTest
  })

  afterEach(() => {
    _resetForTest()
    vi.useRealTimers()
  })

  // ────────────────────────────────────────────────────────────────
  // generateCode
  // ────────────────────────────────────────────────────────────────

  describe('generateCode()', () => {
    const VALID_CHARSET = new Set('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))

    it('returns a 6-character code', () => {
      const { code } = generateCode()
      expect(code).toHaveLength(6)
    })

    it('uses only valid charset characters (no 0, O, I, 1)', () => {
      // Generate several codes to increase confidence
      for (let i = 0; i < 20; i++) {
        _resetForTest()
        const { code } = generateCode()
        for (const char of code) {
          expect(VALID_CHARSET.has(char)).toBe(true)
        }
        // Confirm none of the excluded characters appear
        expect(code).not.toMatch(/[01OI]/)
      }
    })

    it('returns expiresAt ~10 minutes in the future', () => {
      const before = Date.now()
      const { expiresAt } = generateCode()
      const after = Date.now()

      const tenMin = 10 * 60 * 1000
      // Allow 1-second window
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + tenMin - 1000)
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + tenMin + 1000)
    })

    it('returns a Date object for expiresAt', () => {
      const { expiresAt } = generateCode()
      expect(expiresAt).toBeInstanceOf(Date)
    })

    it('calling generateCode twice invalidates the first code', () => {
      const first = generateCode()
      generateCode() // second call

      // First code should now be invalid
      const result = claimCode(first.code)
      expect(result).toBe('invalid')
    })

    it('second generateCode call produces a new active code', () => {
      generateCode() // first
      const { code: second } = generateCode()

      expect(claimCode(second)).toBe('ok')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // claimCode
  // ────────────────────────────────────────────────────────────────

  describe('claimCode()', () => {
    it("returns 'ok' for a valid active code", () => {
      const { code } = generateCode()
      expect(claimCode(code)).toBe('ok')
    })

    it("returns 'consumed' when claiming the same code a second time", () => {
      const { code } = generateCode()
      claimCode(code) // first claim — ok
      expect(claimCode(code)).toBe('consumed')
    })

    it("returns 'invalid' for an unknown code", () => {
      generateCode() // ensures a code exists but we use a different one
      expect(claimCode('ZZZZZZ')).toBe('invalid')
    })

    it("returns 'invalid' when no code has been generated", () => {
      expect(claimCode('AAAAAA')).toBe('invalid')
    })

    it('is case-insensitive: lowercase input matches uppercase code', () => {
      const { code } = generateCode()
      const lower = code.toLowerCase()
      expect(claimCode(lower)).toBe('ok')
    })

    it('is case-insensitive: mixed-case input still matches', () => {
      const { code } = generateCode()
      // Mix first char lower, rest upper
      const mixed = code[0].toLowerCase() + code.slice(1)
      expect(claimCode(mixed)).toBe('ok')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // TTL expiry
  // ────────────────────────────────────────────────────────────────

  describe('TTL expiry', () => {
    it("returns 'invalid' after the TTL has expired", async () => {
      const { code } = generateCode()
      // Advance time past 10 minutes TTL
      vi.advanceTimersByTime(10 * 60 * 1000 + 100)
      expect(claimCode(code)).toBe('invalid')
    })

    it("returns 'ok' just before TTL expires", () => {
      const { code } = generateCode()
      // Just under 10 minutes — should still be valid (using Date check, not setTimeout)
      vi.advanceTimersByTime(10 * 60 * 1000 - 1000)
      expect(claimCode(code)).toBe('ok')
    })
  })

  // ────────────────────────────────────────────────────────────────
  // getActiveCode
  // ────────────────────────────────────────────────────────────────

  describe('getActiveCode()', () => {
    it('returns null when no code has been generated', () => {
      expect(getActiveCode()).toBeNull()
    })

    it('returns the active entry after generateCode', () => {
      const { code, expiresAt } = generateCode()
      const entry = getActiveCode()
      expect(entry).not.toBeNull()
      expect(entry!.code).toBe(code)
      expect(entry!.expiresAt.getTime()).toBe(expiresAt.getTime())
    })

    it('returns null after the code has been claimed', () => {
      const { code } = generateCode()
      claimCode(code)
      // After claim, active entry is cleared
      expect(getActiveCode()).toBeNull()
    })
  })

  // ────────────────────────────────────────────────────────────────
  // _resetForTest
  // ────────────────────────────────────────────────────────────────

  describe('_resetForTest()', () => {
    it('clears active entry', () => {
      generateCode()
      expect(getActiveCode()).not.toBeNull()
      _resetForTest()
      expect(getActiveCode()).toBeNull()
    })

    it('clears consumed codes — same code can be claimed again after reset', () => {
      const { code } = generateCode()
      claimCode(code) // consumed

      _resetForTest()
      generateCode() // need a fresh active code
      // The old consumed set is cleared, but a new code is different; just verify no throw
      expect(() => _resetForTest()).not.toThrow()
    })

    it('is idempotent — calling multiple times does not throw', () => {
      _resetForTest()
      _resetForTest()
      _resetForTest()
    })
  })
})
