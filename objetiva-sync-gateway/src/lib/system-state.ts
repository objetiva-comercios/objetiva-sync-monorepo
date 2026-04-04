/**
 * Shared system state singleton.
 *
 * Extracted into its own module to break the circular dependency between
 * server.ts (which sets startupMode) and app.ts (which reads startupMode
 * in the setup-only mode onRequest hook).
 */

import type { PreflightCheck } from '../routes/preflight.js'

export const systemState = {
  dbConnected: false,
  dbError: null as string | null,
  startTime: new Date(),
  lastDbCheck: null as Date | null,
  // Startup mode — determined once at startup from preflight checks
  // 'normal'     — all critical env vars present, DB reachable
  // 'setup-only' — critical env var(s) missing; only /setup routes allowed
  // 'degraded'   — env vars present but DB unreachable; sync routes may fail
  startupMode: 'normal' as 'normal' | 'setup-only' | 'degraded',
  // Snapshot of preflight checks from startup (for startup banner only)
  // The /api/setup/preflight endpoint runs live checks on each request.
  preflightChecks: [] as PreflightCheck[],
  // Whether a pairing code has been successfully claimed in this container lifecycle
  setupComplete: false,
  // JWT secret that @fastify/jwt was registered with (cached at startup).
  // Used by pairing/claim to return the secret the gateway will use post-restart.
  // Updated by the setup wizard when saving a new JWT_SECRET.
  registeredJwtSecret: null as string | null,
  // The secret @fastify/jwt was ACTUALLY registered with at startup (immutable).
  // Used by auth middleware to detect when the wizard updated the secret mid-lifecycle
  // and activate fallback verification with the new secret.
  startupJwtSecret: null as string | null
}
