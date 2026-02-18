/**
 * Schema regeneration endpoint
 *
 * HTTP endpoint to regenerate Prisma + Zod schemas from PostgreSQL.
 * Works identically to CLI - triggers full regeneration including Prisma client.
 *
 * POST /api/schemas/regenerate
 * - Authentication: Required (JWT)
 * - Detects PostgreSQL schema changes
 * - Regenerates Prisma and Zod TypeScript schemas
 * - Regenerates Prisma client (requires gateway restart)
 * - Returns 202 Accepted immediately, regeneration runs in background
 * - Gateway will restart automatically via tsx watch
 *
 * Note: Returns immediately with 202 status. The regeneration process
 *       will stop the gateway, regenerate everything, and tsx watch will
 *       automatically restart it. Check logs for completion status.
 */

import type { FastifyInstance } from 'fastify';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../lib/logger.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Spawn CLI regeneration command as detached background process
 * Returns immediately to avoid deadlock when gateway gets killed
 */
function triggerBackgroundRegeneration(): void {
  const gatewayRoot = resolve(__dirname, '..', '..');

  logger.info('Spawning background regeneration process (detached)');

  // Spawn detached process that will survive gateway shutdown
  const child = spawn('npm', ['run', 'regenerate-schemas'], {
    cwd: gatewayRoot,
    detached: true,
    stdio: 'ignore', // Don't pipe streams to avoid keeping connection open
    shell: true,
  });

  // Unref so parent can exit independently
  child.unref();

  logger.info({ pid: child.pid }, 'Background regeneration process spawned');
}


/**
 * Register schema regeneration routes
 */
export async function registerRegenerateRoutes(app: FastifyInstance) {
  /**
   * POST /api/schemas/regenerate
   *
   * Regenerate all schemas from PostgreSQL (identical to CLI behavior)
   *
   * Authentication: Required (JWT)
   *
   * Success response (202 Accepted):
   * {
   *   success: true,
   *   message: "Schema regeneration started",
   *   note: "Gateway will restart automatically when complete"
   * }
   *
   * Process:
   * 1. Spawns CLI regeneration command in detached background process
   * 2. Returns 202 immediately (avoids deadlock when gateway stops)
   * 3. Background process: stops gateway, regenerates schemas, runs prisma generate
   * 4. tsx watch detects file changes and auto-restarts gateway
   *
   * Error responses:
   * - 401: Unauthorized
   * - 500: Failed to start regeneration
   */
  app.post(
    '/api/schemas/regenerate',
    { preHandler: authenticate },
    async (_request, reply) => {
      try {
        logger.info('Schema regeneration requested via HTTP endpoint');

        // Trigger background regeneration (returns immediately)
        triggerBackgroundRegeneration();

        // Return 202 Accepted - regeneration will happen in background
        return reply.status(202).send({
          success: true,
          message: 'Schema regeneration started',
          note: 'Gateway will restart automatically when complete (tsx watch). Check server logs for progress.',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to start schema regeneration');
        return reply.status(500).send({
          success: false,
          error: 'Failed to start schema regeneration',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
