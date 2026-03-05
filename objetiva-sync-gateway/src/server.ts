import { buildApp } from './app.js'
import { logger } from './lib/logger.js'
import { prisma } from './lib/prisma.js'
import { runAllPreflightChecks, type PreflightCheck } from './routes/preflight.js'
import { systemState } from './lib/system-state.js'

// Re-export systemState so existing code importing from server.ts still works
export { systemState }

const PORT = Number(process.env.PORT) || 3335
const HOST = process.env.HOST || '0.0.0.0'

// ---------------------------------------------------------------------------
// Startup banner — prints to stderr so it doesn't pollute JSON log output
// ---------------------------------------------------------------------------

function printStartupBanner(
  mode: typeof systemState.startupMode,
  checks: PreflightCheck[]
): void {
  const icons: Record<string, string> = { pass: '[OK]', fail: '[FAIL]', warn: '[WARN]' }
  const lines = [
    '',
    '=== Objetiva Sync Gateway — Startup Check ===',
    `Mode: ${mode.toUpperCase()}`,
    ''
  ]

  checks.forEach((c, i) => {
    lines.push(`  ${i + 1}. ${icons[c.status] || '[?]'} ${c.name}: ${c.message}`)
    if (c.remediation && c.status !== 'pass') {
      lines.push(`        -> ${c.remediation}`)
    }
  })

  lines.push('')
  if (mode === 'setup-only') {
    lines.push('  Action required: visit http://' + HOST + ':' + PORT + '/setup')
  } else if (mode === 'degraded') {
    lines.push('  Warning: gateway is running in degraded mode — DB unreachable')
  } else {
    lines.push('  All systems go.')
  }
  lines.push('=============================================')
  lines.push('')

  process.stderr.write(lines.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  try {
    // Run preflight checks before building the app so startupMode is set
    // before the onRequest hook in app.ts evaluates it.
    const checks = await runAllPreflightChecks()
    systemState.preflightChecks = checks

    // Determine startup mode from check results
    const envVarsCheck = checks.find((c) => c.id === 'env_vars')
    const dbCheck = checks.find((c) => c.id === 'db_connectivity')

    if (envVarsCheck?.status === 'fail') {
      systemState.startupMode = 'setup-only'
    } else if (dbCheck?.status === 'fail') {
      systemState.startupMode = 'degraded'
    } else {
      systemState.startupMode = 'normal'
    }

    // Update legacy dbConnected fields for backward compatibility
    systemState.dbConnected = dbCheck?.status === 'pass'
    systemState.dbError = dbCheck?.status === 'fail' ? dbCheck.message : null
    systemState.lastDbCheck = new Date()

    // Print startup banner to stderr
    printStartupBanner(systemState.startupMode, checks)

    // Still attempt prisma connect for the connection pool (best-effort)
    // preflight already ran SELECT 1 — this just warms the pool
    if (systemState.startupMode !== 'setup-only') {
      try {
        await prisma.$connect()
      } catch {
        // Already captured in preflight check — ignore here
      }
    }

    // Build app (always start, even without DB — setup wizard needs to be accessible)
    const app = await buildApp()

    // Start server
    await app.listen({ port: PORT, host: HOST })

    logger.info(`Sync Gateway listening on http://${HOST}:${PORT} [mode=${systemState.startupMode}]`)

    if (systemState.startupMode === 'setup-only') {
      logger.warn('Gateway is in setup-only mode. Visit http://' + HOST + ':' + PORT + '/setup')
    }

  } catch (error) {
    logger.error(error, 'Critical error starting server')
    process.exit(1)
  }
}

start()
