/**
 * Schema distribution endpoint
 *
 * Authenticated HTTP endpoint that serves PostgreSQL schema metadata to the
 * remote sync service. Enables schema discovery over HTTP with caching.
 *
 * Features:
 * - JWT authentication (SCHEMA-03)
 * - Entity validation against allowed list
 * - 1-hour in-memory caching (SCHEMA-04)
 * - Cache hit/miss headers (X-Cache, Cache-Control)
 * - Proper error responses (401, 404, 500)
 */

import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { IntrospectionService } from '../services/introspection.js';
import { getSyncEntities } from '../config/entities.js';
import { schemaCache } from '../services/schema-cache.js';
import { logger } from '../lib/logger.js';
import type { TableSchema } from '../types/schema.js';

/**
 * API response shape for schema endpoint
 *
 * Maps TableSchema (database-centric) to API contract (client-centric):
 * - table_name → entity
 * - omits table_comment
 * - preserves columns and constraints
 */
interface SchemaResponse {
  entity: string;
  columns: TableSchema['columns'];
  constraints: TableSchema['constraints'];
}

/**
 * Register schema distribution routes
 *
 * @param app - Fastify application instance
 */
export async function registerSchemaRoutes(app: FastifyInstance) {
  /**
   * GET /api/schemas/:entity
   *
   * Retrieve complete schema metadata for a sync entity.
   *
   * Authentication: Required (JWT)
   *
   * Path parameters:
   * - entity: Table name (must be in allowed sync entities list)
   *
   * Response headers:
   * - X-Cache: HIT | MISS
   * - Cache-Control: public, max-age=3600
   *
   * Success response (200):
   * {
   *   entity: string,
   *   columns: ColumnMetadata[],
   *   constraints: ConstraintMetadata[]
   * }
   *
   * Error responses:
   * - 401: Unauthorized (handled by authenticate middleware)
   * - 404: Entity not found (code: ENTITY_NOT_FOUND)
   * - 500: Introspection failed (code: INTROSPECTION_FAILED or pg error code)
   */
  app.get(
    '/api/schemas/:entity',
    { preHandler: authenticate },
    async (request, reply) => {
      const { entity } = request.params as { entity: string };

      // Validate entity against allowed list
      const allowedEntities = getSyncEntities();
      if (!allowedEntities.includes(entity)) {
        return reply.status(404).send({
          error: `Entity not found: ${entity}`,
          code: 'ENTITY_NOT_FOUND',
        });
      }

      // Check cache first
      const cached = schemaCache.get<SchemaResponse>(entity);
      if (cached) {
        reply.header('X-Cache', 'HIT');
        reply.header('Cache-Control', 'public, max-age=3600');
        return cached;
      }

      // Cache miss - introspect from database
      try {
        const tableSchema = await IntrospectionService.introspectTable(
          'public',
          entity
        );

        // Map to API response shape (rename table_name to entity, omit table_comment)
        const response: SchemaResponse = {
          entity: tableSchema.table_name,
          columns: tableSchema.columns,
          constraints: tableSchema.constraints,
        };

        // Store mapped response in cache
        schemaCache.set(entity, response);

        // Set response headers
        reply.header('X-Cache', 'MISS');
        reply.header('Cache-Control', 'public, max-age=3600');

        return response;
      } catch (error) {
        // Extract error details
        const message = error instanceof Error ? error.message : String(error);
        const errorCode =
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code: string }).code)
            : 'INTROSPECTION_FAILED';

        logger.error(
          { entity, error: message, code: errorCode },
          'Schema introspection failed'
        );

        return reply.status(500).send({
          error: `Failed to introspect entity: ${entity}`,
          code: errorCode,
          details: { message },
        });
      }
    }
  );
}
