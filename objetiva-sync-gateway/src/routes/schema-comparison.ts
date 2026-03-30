/**
 * Schema comparison routes
 *
 * Provides two endpoints for the 3-way schema comparison feature:
 *
 * - POST /api/schemas/report  — sync reports its compiled schema snapshot
 * - GET  /api/schemas/compare — returns 3-way comparison for all 4 entities
 *
 * Locked decisions (from 26-RESEARCH.md):
 * - D-01: Single POST stores all 4 entity schemas at once (full overwrite)
 * - D-03: Both endpoints use JWT authenticate middleware
 * - D-06: GET returns all 4 entities in one response
 * - D-07: Per-field structure with 3 layers (postgresql, compiled, sync)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { IntrospectionService } from '../services/introspection.js';
import { getSyncEntities } from '../config/entities.js';
import { getTableSchema } from '@objetiva/shared/schemas';
import { syncSchemaStore } from '../services/sync-schema-store.js';
import { buildEntityComparison } from '../services/schema-comparison.js';
import { logger } from '../lib/logger.js';
import type { EntityComparison } from '../services/schema-comparison.js';
import type { TableSchema } from '../types/schema.js';

// ────────────────────────────────────────────────────────────────
// Zod validation schema for POST body (Pattern 6 from RESEARCH.md)
// ────────────────────────────────────────────────────────────────

const columnMetadataSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.boolean(),
  default_value: z.string().nullable().default(null),
  ordinal_position: z.number().int().positive().optional(),
  column_comment: z.string().nullable().optional(),
});

const constraintMetadataSchema = z.object({
  constraint_name: z.string(),
  constraint_type: z.enum(['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK']),
  columns: z.array(z.string()),
});

const tableSchemaMetadataSchema = z.object({
  entity: z.string(),
  columns: z.array(columnMetadataSchema),
  constraints: z.array(constraintMetadataSchema),
});

const reportBodySchema = z.object({
  schemas: z.array(tableSchemaMetadataSchema).min(1),
});

// ────────────────────────────────────────────────────────────────
// Route registration
// ────────────────────────────────────────────────────────────────

/**
 * Register schema comparison routes on the Fastify instance.
 *
 * IMPORTANT: Must be registered BEFORE setNotFoundHandler in app.ts (Pitfall 6).
 *
 * @param app - Fastify application instance
 */
export async function registerSchemaComparisonRoutes(app: FastifyInstance) {
  /**
   * POST /api/schemas/report
   *
   * Receives sync-reported schema snapshot for all entities.
   * Overwrites the in-memory store entirely (D-01, D-04).
   *
   * Authentication: Required (JWT)
   *
   * Request body:
   * {
   *   schemas: TableSchemaMetadata[]  // min 1 item
   * }
   *
   * Success response (200):
   * { success: true }
   *
   * Error responses:
   * - 401: Unauthorized
   * - 400: VALIDATION_ERROR (invalid body or empty schemas array)
   */
  app.post(
    '/api/schemas/report',
    { preHandler: authenticate },
    async (request, reply) => {
      const parseResult = reportBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid schema report body',
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten(),
        });
      }

      syncSchemaStore.set(parseResult.data.schemas);

      logger.info(
        { entities: parseResult.data.schemas.map((s) => s.entity) },
        'Sync schema snapshot stored',
      );

      return reply.status(200).send({ success: true });
    },
  );

  /**
   * GET /api/schemas/compare
   *
   * Returns 3-way comparison for all 4 sync entities.
   * Uses sequential loop to avoid connection pool exhaustion (Pitfall 4 / anti-pattern).
   *
   * Authentication: Required (JWT)
   *
   * Success response (200):
   * EntityComparison[]  // one entry per sync entity
   *
   * Error responses:
   * - 401: Unauthorized
   */
  app.get(
    '/api/schemas/compare',
    { preHandler: authenticate },
    async (_request, _reply) => {
      const entities = getSyncEntities();
      const results: EntityComparison[] = [];
      const syncReported = syncSchemaStore.hasData();

      // Sequential loop — avoid pool exhaustion (per Pitfall 4 in RESEARCH.md)
      for (const entity of entities) {
        let pgSchema: TableSchema | null = null;
        try {
          pgSchema = await IntrospectionService.introspectTable('public', entity);
        } catch (err) {
          logger.error({ entity, err }, 'Introspection failed for comparison — entity will show as missing');
        }

        const compiledSchema = getTableSchema(entity);
        const syncSchema = syncSchemaStore.get(entity);

        results.push(buildEntityComparison(entity, pgSchema, compiledSchema, syncSchema, syncReported));
      }

      return results;
    },
  );
}
