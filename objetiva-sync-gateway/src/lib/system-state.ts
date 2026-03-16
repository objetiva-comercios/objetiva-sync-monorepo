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
  setupComplete: false
}
