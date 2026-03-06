import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Lazy-initialized Prisma client.
 *
 * When DATABASE_URL is not set (setup wizard mode), the client is not created
 * and any attempt to use it will throw a clear error instead of crashing the
 * entire process at import time.
 */
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    // Return a Proxy that throws on any property access that looks like a
    // Prisma method call.  This lets the server boot in setup-only mode
    // without crashing, while giving a clear error if code accidentally
    // tries to query the DB before setup is complete.
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        // Allow type-checking / toString / Symbol access without throwing
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') {
          return undefined
        }
        // $on, $connect, $disconnect — no-op in setup mode
        if (prop === '$on' || prop === '$disconnect') {
          return () => Promise.resolve()
        }
        if (prop === '$connect') {
          return () => Promise.reject(new Error('DATABASE_URL is not configured'))
        }
        // $queryRaw and model accessors — throw descriptive error
        throw new Error(
          `Database is not configured (DATABASE_URL not set). Complete the setup wizard at /setup first.`
        )
      }
    })
  }

  const client =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' }
      ]
    })

  // Log queries en desarrollo
  if (process.env.NODE_ENV === 'development') {
    client.$on('query' as never, (e: any) => {
      logger.debug({ query: e.query, duration: e.duration }, 'Database query')
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}

export const prisma = createPrismaClient()

// Graceful shutdown
process.on('beforeExit', async () => {
  if (process.env.DATABASE_URL) {
    await prisma.$disconnect()
  }
})
