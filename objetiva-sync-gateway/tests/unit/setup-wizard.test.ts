/**
 * Unit Tests for assembleGatewayUrl helper (Phase 19, Plan 01)
 *
 * Tests the pure URL assembly function that combines protocol + domain + port
 * with correct default-port omission logic.
 */

import { describe, it, expect } from 'vitest'
import { assembleGatewayUrl } from '../../src/routes/setup.js'

describe('assembleGatewayUrl', () => {
  it('returns bare https URL when no port provided', () => {
    expect(assembleGatewayUrl('https', 'gw.example.com', undefined)).toBe('https://gw.example.com')
  })

  it('returns https URL with non-default port', () => {
    expect(assembleGatewayUrl('https', 'gw.example.com', '8443')).toBe('https://gw.example.com:8443')
  })

  it('omits port 443 for https (default)', () => {
    expect(assembleGatewayUrl('https', 'gw.example.com', '443')).toBe('https://gw.example.com')
  })

  it('omits port 80 for http (default)', () => {
    expect(assembleGatewayUrl('http', 'gw.example.com', '80')).toBe('http://gw.example.com')
  })

  it('omits empty string port', () => {
    expect(assembleGatewayUrl('http', 'gw.example.com', '')).toBe('http://gw.example.com')
  })

  it('returns http URL with non-default port', () => {
    expect(assembleGatewayUrl('http', 'gw.example.com', '8080')).toBe('http://gw.example.com:8080')
  })
})
