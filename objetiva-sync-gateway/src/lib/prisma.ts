import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let _realClient: PrismaClient | null = null

/**
 * Get or create the real PrismaClient.
 * Only called when DATABASE_URL is available.
 */
function getRealClient(): PrismaClient {
  if (_realClient) return _realClient

  _realClient =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' }
      ]
    })

  if (process.env.NODE_ENV === 'development') {
    _realClient.$on('query' as never, (e: any) => {
      logger.debug({ query: e.query, duration: e.duration }, 'Database query')
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = _realClient
  }

  return _realClient
}

/**
 * Prisma client proxy.
 *
 * - If DATABASE_URL is set, delegates to a real PrismaClient (lazy-created).
 * - If DATABASE_URL is not set, throws a descriptive error on DB operations.
 *
 * This allows the server to boot in setup-only mode without DATABASE_URL,
 * and transparently start working once the wizard sets it in process.env.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    // Allow type-checking / Symbol access without throwing
    if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') {
      return undefined
    }

    // If DATABASE_URL is now available, delegate to real client
    if (process.env.DATABASE_URL) {
      const client = getRealClient()
      const value = Reflect.get(client, prop, receiver)
      return typeof value === 'function' ? value.bind(client) : value
    }

    // No DATABASE_URL — graceful stubs for lifecycle methods
    if (prop === '$on' || prop === '$disconnect') {
      return () => Promise.resolve()
    }
    if (prop === '$connect') {
      return () => Promise.reject(new Error('DATABASE_URL is not configured'))
    }

    // All other access throws
    throw new Error(
      'Database is not configured (DATABASE_URL not set). Complete the setup wizard at /setup first.'
    )
  }
})

// Graceful shutdown
process.on('beforeExit', async () => {
  if (_realClient) {
    await _realClient.$disconnect()
  }
})
