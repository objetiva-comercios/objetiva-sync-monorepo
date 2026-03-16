/**
 * Preflight check endpoint — Phase 18, Plan 02
 *
 * GET /api/setup/preflight returns a live 5-check health report used by the
 * setup wizard (Phase 19) to show real-time system status.
 *
 * Checks run on every request (never cached) so the wizard reflects changes
 * made mid-session (e.g. user just saved DATABASE_URL via setup wizard).
 */

import type { FastifyInstance } from 'fastify'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import { prisma } from '../lib/prisma.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'fail' | 'warn'

export interface PreflightCheck {
  id: string
  name: string
  status: CheckStatus
  message: string
  remediation: string | null
}

// ---------------------------------------------------------------------------
// JWT sentinel strings that indicate default / unconfigured secret
// ---------------------------------------------------------------------------

const JWT_DEFAULT_SENTINELS = [
  'change-me-in-production',
  'change-this-secret-in-production-debe-ser-el-mismo-que-en-objetiva-sync'
]

// ---------------------------------------------------------------------------
// Individual check implementations
// ---------------------------------------------------------------------------

async function checkEnvVars(): Promise<PreflightCheck> {
  const missing: string[] = []
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET')

  // GATEWAY_PUBLIC_URL is optional — warn if absent, do not fail
  const warnMissing: string[] = []
  if (!process.env.GATEWAY_PUBLIC_URL) warnMissing.push('GATEWAY_PUBLIC_URL')

  if (missing.length > 0) {
    return {
      id: 'env_vars',
      name: 'Environment variables',
      status: 'fail',
      message: `Missing required variable(s): ${missing.join(', ')}`,
      remediation: `Set ${missing.join(', ')} in your .env file and restart the gateway.`
    }
  }

  if (warnMissing.length > 0) {
    return {
      id: 'env_vars',
      name: 'Environment variables',
      status: 'warn',
      message: `Optional variable(s) not set: ${warnMissing.join(', ')}`,
      remediation: `Set GATEWAY_PUBLIC_URL for public URL generation (e.g. https://gateway.example.com).`
    }
  }

  return {
    id: 'env_vars',
    name: 'Environment variables',
    status: 'pass',
    message: 'All required environment variables are set.',
    remediation: null
  }
}

async function checkDbConnectivity(): Promise<PreflightCheck> {
  if (!process.env.DATABASE_URL) {
    return {
      id: 'db_connectivity',
      name: 'Database connectivity',
      status: 'fail',
      message: 'DATABASE_URL is not set — cannot attempt connection.',
      remediation: 'Set DATABASE_URL in your .env file and restart the gateway.'
    }
  }

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout after 5 s')), 5000)
      )
    ])
    return {
      id: 'db_connectivity',
      name: 'Database connectivity',
      status: 'pass',
      message: 'PostgreSQL connection successful.',
      remediation: null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: 'db_connectivity',
      name: 'Database connectivity',
      status: 'fail',
      message: `Cannot connect to PostgreSQL: ${message}`,
      remediation: 'Check DATABASE_URL credentials and ensure PostgreSQL is running.'
    }
  }
}

async function checkDbTables(): Promise<PreflightCheck> {
  if (!process.env.DATABASE_URL) {
    return {
      id: 'db_tables',
      name: 'Database tables',
      status: 'fail',
      message: 'DATABASE_URL is not set — skipping table check.',
      remediation: 'Set DATABASE_URL in your .env file and restart the gateway.'
    }
  }

  const required = [
    'articulos',
    'comprobantes_cabecera',
    'comprobantes_detalle',
    'comprobantes_pagos'
  ]

  try {
    const result = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY['articulos', 'comprobantes_cabecera', 'comprobantes_detalle', 'comprobantes_pagos'])
    `

    const existing = result.map((r) => r.tablename)
    const missing = required.filter((t) => !existing.includes(t))

    if (missing.length > 0) {
      return {
        id: 'db_tables',
        name: 'Database tables',
        status: 'fail',
        message: `Missing table(s): ${missing.join(', ')}`,
        remediation: 'Run: npx prisma migrate deploy'
      }
    }

    return {
      id: 'db_tables',
      name: 'Database tables',
      status: 'pass',
      message: `All ${required.length} required tables exist.`,
      remediation: null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      id: 'db_tables',
      name: 'Database tables',
      status: 'fail',
      message: `Error checking tables: ${message}`,
      remediation: 'Ensure the database connection is healthy, then run: npx prisma migrate deploy'
    }
  }
}

function checkJwtConfigured(): PreflightCheck {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    return {
      id: 'jwt_configured',
      name: 'JWT configuration',
      status: 'fail',
      message: 'JWT_SECRET is not set.',
      remediation: 'Set JWT_SECRET to a strong random string (min 32 chars) in your .env file.'
    }
  }

  if (JWT_DEFAULT_SENTINELS.includes(secret)) {
    return {
      id: 'jwt_configured',
      name: 'JWT configuration',
      status: 'warn',
      message: 'JWT_SECRET is set to a default placeholder value — insecure.',
      remediation: 'Replace JWT_SECRET with a strong random string (min 32 chars) via the setup wizard.'
    }
  }

  return {
    id: 'jwt_configured',
    name: 'JWT configuration',
    status: 'pass',
    message: 'JWT_SECRET is configured.',
    remediation: null
  }
}

async function checkEnvFileWritable(): Promise<PreflightCheck> {
  const envPath = path.join(process.cwd(), '.env')

  // If file does not exist, attempt to create it
  try {
    await fs.access(envPath, fsSync.constants.F_OK)
  } catch {
    // File doesn't exist — try to create it
    try {
      await fs.writeFile(envPath, '# .env — Generated by Objetiva Sync Gateway\n', 'utf-8')
      return {
        id: 'env_file_writable',
        name: '.env file writable',
        status: 'pass',
        message: '.env file created successfully.',
        remediation: null
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        id: 'env_file_writable',
        name: '.env file writable',
        status: 'fail',
        message: `Cannot create .env file: ${message}`,
        remediation: 'Ensure the gateway process has write permission to its working directory.'
      }
    }
  }

  // File exists — check write permission
  try {
    await fs.access(envPath, fsSync.constants.W_OK)
    return {
      id: 'env_file_writable',
      name: '.env file writable',
      status: 'pass',
      message: '.env file is writable.',
      remediation: null
    }
  } catch {
    return {
      id: 'env_file_writable',
      name: '.env file writable',
      status: 'fail',
      message: '.env file exists but is not writable.',
      remediation: 'Run: chmod 600 .env  (or fix file permissions so the gateway user can write to it).'
    }
  }
}

// ---------------------------------------------------------------------------
// Public: run all checks (exported for startup banner in server.ts)
// ---------------------------------------------------------------------------

export async function runAllPreflightChecks(): Promise<PreflightCheck[]> {
  const [envVars, dbConnectivity, dbTables, envFileWritable] = await Promise.all([
    checkEnvVars(),
    checkDbConnectivity(),
    checkDbTables(),
    checkEnvFileWritable()
  ])

  // jwt_configured is synchronous — run inline
  const jwtConfigured = checkJwtConfigured()

  // Order must match EXPECTED_CHECK_IDS in tests
  return [envVars, dbConnectivity, dbTables, jwtConfigured, envFileWritable]
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerPreflightRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/setup/preflight
  // Per-route rate limit: 10 requests per minute (requires @fastify/rate-limit registered globally)
  app.get(
    '/api/setup/preflight',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (_request, reply) => {
      // Run live checks on every request — never return cached results
      const checks = await runAllPreflightChecks()
      const ready = checks.every((c) => c.status === 'pass')

      return reply.code(200).send({
        ready,
        checks,
        timestamp: new Date().toISOString()
      })
    }
  )
}
