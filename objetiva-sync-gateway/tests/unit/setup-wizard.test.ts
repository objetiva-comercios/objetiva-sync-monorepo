/**
 * Unit Tests for normalizeGatewayUrl helper (Phase 19, Plan 01)
 *
 * Tests the URL normalization function that adds protocol if missing
 * and strips default ports.
 */

import { describe, it, expect } from 'vitest'
import { normalizeGatewayUrl } from '../../src/routes/setup.js'

describe('normalizeGatewayUrl', () => {
  it('returns bare https URL as-is', () => {
    expect(normalizeGatewayUrl('https://gw.example.com')).toBe('https://gw.example.com')
  })

  it('preserves non-default port', () => {
    expect(normalizeGatewayUrl('https://gw.example.com:8443')).toBe('https://gw.example.com:8443')
  })

  it('strips default port 443 for https', () => {
    expect(normalizeGatewayUrl('https://gw.example.com:443')).toBe('https://gw.example.com')
  })

  it('strips default port 80 for http', () => {
    expect(normalizeGatewayUrl('http://gw.example.com:80')).toBe('http://gw.example.com')
  })

  it('adds http:// when no protocol is provided', () => {
    expect(normalizeGatewayUrl('gw.example.com')).toBe('http://gw.example.com')
  })

  it('adds http:// and preserves custom port', () => {
    expect(normalizeGatewayUrl('gw.example.com:8080')).toBe('http://gw.example.com:8080')
  })

  it('preserves http URL with non-default port', () => {
    expect(normalizeGatewayUrl('http://gw.example.com:8080')).toBe('http://gw.example.com:8080')
  })

  it('trims whitespace', () => {
    expect(normalizeGatewayUrl('  http://gw.example.com  ')).toBe('http://gw.example.com')
  })

  it('strips trailing slash', () => {
    expect(normalizeGatewayUrl('http://gw.example.com/')).toBe('http://gw.example.com')
  })
})
