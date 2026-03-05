/**
 * pairing-store.ts — In-memory pairing code store (Phase 20)
 *
 * Manages short-lived 6-character pairing codes that let sync clients
 * obtain gateway credentials in a single authenticated exchange.
 *
 * Design:
 * - One active code at a time (generateCode invalidates any previous code)
 * - 10-minute TTL enforced by Date comparison (not just setTimeout)
 * - consumedCodes Set tracks claimed codes for 410 vs 404 distinction
 * - All setTimeout handles call .unref() to prevent process hang in tests
 * - In-memory only — codes are lost on restart (acceptable per architecture decision)
 */

import crypto from 'crypto'

// 32-char charset: A-Z minus O and I, digits 2-9 minus 0 and 1
// 256 % 32 === 0 → no modulo bias in crypto.randomBytes selection
export const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const TTL_MS = 10 * 60 * 1000 // 10 minutes

export interface PairingEntry {
  code: string
  expiresAt: Date
  timeoutHandle: ReturnType<typeof setTimeout>
}

// Module-level singleton state
let activeEntry: PairingEntry | null = null
const consumedCodes = new Set<string>()

/**
 * Generate a new pairing code, invalidating any previously active code.
 * Returns the new code and its expiration timestamp.
 */
export function generateCode(): { code: string; expiresAt: Date } {
  // Invalidate previous active code (if any)
  if (activeEntry !== null) {
    clearTimeout(activeEntry.timeoutHandle)
    activeEntry = null
  }

  // Generate secure random code from CHARSET
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[bytes[i] % CHARSET.length]
  }

  const expiresAt = new Date(Date.now() + TTL_MS)

  // Schedule cleanup of active entry and consumed tracking
  const timeoutHandle = setTimeout(() => {
    if (activeEntry?.code === code) {
      activeEntry = null
    }
    // Clean up consumed tracking after TTL + 5s buffer
    setTimeout(() => {
      consumedCodes.delete(code)
    }, 5000).unref()
  }, TTL_MS)
  timeoutHandle.unref()

  activeEntry = { code, expiresAt, timeoutHandle }

  return { code, expiresAt }
}

/**
 * Attempt to claim a pairing code.
 * Returns:
 *  - 'ok'       — valid active code, now consumed
 *  - 'consumed' — code was already claimed (enables 410 response)
 *  - 'invalid'  — unknown, expired, or invalidated code (enables 404 response)
 *
 * Input is normalized to uppercase for case-insensitive matching.
 */
export function claimCode(input: string): 'ok' | 'consumed' | 'invalid' {
  const normalized = input.toUpperCase()

  // Check consumed codes first — distinct 410 case
  if (consumedCodes.has(normalized)) {
    return 'consumed'
  }

  // Check active entry
  if (activeEntry === null) {
    return 'invalid'
  }

  // Verify code matches and has not expired
  if (activeEntry.code !== normalized || Date.now() >= activeEntry.expiresAt.getTime()) {
    return 'invalid'
  }

  // Mark as consumed and clear active entry
  consumedCodes.add(normalized)
  clearTimeout(activeEntry.timeoutHandle)
  activeEntry = null

  return 'ok'
}

/**
 * Return the current active pairing entry (or null if none).
 * Used by the generate endpoint to return current code details.
 */
export function getActiveCode(): PairingEntry | null {
  return activeEntry
}

/**
 * Reset all state for test isolation.
 * Must be called in afterEach/beforeEach in tests.
 */
export function _resetForTest(): void {
  if (activeEntry !== null) {
    clearTimeout(activeEntry.timeoutHandle)
    activeEntry = null
  }
  consumedCodes.clear()
}
