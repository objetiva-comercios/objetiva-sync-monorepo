/**
 * PostgreSQL Schema Introspection Service
 *
 * Queries information_schema to extract complete schema metadata for sync entities:
 * - Column definitions (name, type, nullability, defaults, comments)
 * - Constraint definitions (PK, FK, UNIQUE, CHECK)
 * - Table comments
 *
 * Features:
 * - Type normalization (PostgreSQL verbose names → simplified standards)
 * - Sequential entity processing (avoid pool exhaustion)
 * - Partial results on failures (returns successful + errors)
 * - Retry wrapper for connection resilience
 */

import { introspectionPool } from '../lib/db.js';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';
import type {
  ColumnMetadata,
  ConstraintMetadata,
  TableSchema,
  IntrospectionResult,
  IntrospectionError,
} from '../types/schema.js';

/**
 * Type mapping from PostgreSQL verbose type names to simplified standards
 *
 * Maps information_schema.columns.data_type and udt_name to normalized names
 * used throughout the sync system.
 */
const TYPE_MAPPING: Record<string, string> = {
  'character varying': 'varchar',
  'character': 'char',
  'integer': 'int',
  'smallint': 'int',
  'bigint': 'int',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamp',
  'double precision': 'float',
  'real': 'float',
  'numeric': 'decimal',
  'jsonb': 'jsonb',
  'json': 'jsonb',
  'ARRAY': 'array',
  'boolean': 'boolean',
  'text': 'text',
  'date': 'date',
  'time without time zone': 'time',
  'time with time zone': 'time',
  'uuid': 'uuid',
};

/**
 * Normalize PostgreSQL data type to simplified standard name
 *
 * @param dataType - Value from information_schema.columns.data_type
 * @param _udtName - Value from information_schema.columns.udt_name (reserved for future use)
 * @returns Normalized type name (e.g., 'varchar', 'int', 'timestamp')
 */
function normalizeType(dataType: string, _udtName: string): string {
  // Handle array types specially
  if (dataType === 'ARRAY') {
    return 'array';
  }

  // Look up in mapping, return original if not found
  return TYPE_MAPPING[dataType] || dataType;
}

/**
 * Introspect column metadata for a table
 *
 * Queries information_schema.columns for column definitions and uses
 * col_description() to retrieve PostgreSQL column comments.
 *
 * @param schema - Schema name (usually 'public')
 * @param tableName - Table name to introspect
 * @returns Array of column metadata, ordered by ordinal position
 */
async function introspectColumns(
  schema: string,
  tableName: string
): Promise<ColumnMetadata[]> {
  const query = `
    SELECT
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      c.ordinal_position,
      col_description(
        (quote_ident($1) || '.' || quote_ident($2))::regclass,
        c.ordinal_position
      ) AS column_comment
    FROM information_schema.columns c
    WHERE c.table_schema = $1
      AND c.table_name = $2
    ORDER BY c.ordinal_position;
  `;

  const result = await introspectionPool.query(query, [schema, tableName]);

  return result.rows.map((row) => ({
    column_name: row.column_name,
    data_type: normalizeType(row.data_type, row.udt_name),
    is_nullable: row.is_nullable === 'YES',
    default_value: row.column_default,
    ordinal_position: row.ordinal_position,
    column_comment: row.column_comment,
  }));
}

/**
 * Introspect constraint metadata for a table
 *
 * Queries information_schema.table_constraints joined with key_column_usage
 * and referential_constraints to extract:
 * - PRIMARY KEY constraints
 * - FOREIGN KEY constraints (with referenced table/columns)
 * - UNIQUE constraints
 * - CHECK constraints
 *
 * Multi-column constraints are grouped by constraint_name.
 *
 * @param schema - Schema name (usually 'public')
 * @param tableName - Table name to introspect
 * @returns Array of constraint metadata
 */
async function introspectConstraints(
  schema: string,
  tableName: string
): Promise<ConstraintMetadata[]> {
  const query = `
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name,
      kcu.ordinal_position,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = $1
      AND tc.table_name = $2
      AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
    ORDER BY tc.constraint_name, kcu.ordinal_position;
  `;

  const result = await introspectionPool.query(query, [schema, tableName]);

  // Group rows by constraint_name to handle multi-column constraints
  const constraintMap = new Map<string, ConstraintMetadata>();

  for (const row of result.rows) {
    const constraintName = row.constraint_name;
    let constraint = constraintMap.get(constraintName);

    if (!constraint) {
      constraint = {
        constraint_name: constraintName,
        constraint_type: row.constraint_type,
        columns: [],
      };
      constraintMap.set(constraintName, constraint);
    }

    // Add column to the constraint's column list
    if (row.column_name) {
      constraint.columns.push(row.column_name);
    }

    // Add foreign key details if this is a FK constraint
    if (row.constraint_type === 'FOREIGN KEY') {
      if (row.foreign_table_name) {
        constraint.foreign_table = row.foreign_table_name;
      }
      if (row.foreign_column_name) {
        if (!constraint.foreign_columns) {
          constraint.foreign_columns = [];
        }
        constraint.foreign_columns.push(row.foreign_column_name);
      }
    }
  }

  return Array.from(constraintMap.values());
}

/**
 * Get table comment from PostgreSQL catalog
 *
 * Uses obj_description() with regclass to retrieve the table comment
 * set via COMMENT ON TABLE statement.
 *
 * @param schema - Schema name (usually 'public')
 * @param tableName - Table name to introspect
 * @returns Table comment string, or null if no comment exists
 */
async function getTableComment(
  schema: string,
  tableName: string
): Promise<string | null> {
  const query = `
    SELECT obj_description(
      (quote_ident($1) || '.' || quote_ident($2))::regclass,
      'pg_class'
    ) AS table_comment;
  `;

  const result = await introspectionPool.query(query, [schema, tableName]);
  return result.rows[0]?.table_comment || null;
}

/**
 * Introspect complete schema for a single table
 *
 * Combines column metadata, constraint metadata, and table comment
 * into a complete TableSchema object.
 *
 * Wrapped with retry logic for connection resilience (retries only
 * connection errors, not SQL or permission errors).
 *
 * @param schema - Schema name (usually 'public')
 * @param tableName - Table name to introspect
 * @returns Complete table schema metadata
 * @throws Error if introspection fails after retries
 */
async function introspectTable(
  schema: string,
  tableName: string
): Promise<TableSchema> {
  return withRetry(async () => {
    const [columns, constraints, tableComment] = await Promise.all([
      introspectColumns(schema, tableName),
      introspectConstraints(schema, tableName),
      getTableComment(schema, tableName),
    ]);

    return {
      table_name: tableName,
      table_comment: tableComment,
      columns,
      constraints,
    };
  }, `introspectTable(${schema}.${tableName})`);
}

/**
 * Introspect schema for multiple entities
 *
 * Processes entities SEQUENTIALLY (not in parallel) to avoid pool exhaustion.
 * Returns partial results: successful introspections + errors for failures.
 *
 * @param entityNames - Array of table names to introspect
 * @param schema - Schema name (defaults to 'public')
 * @returns IntrospectionResult with tables array and errors array
 */
async function introspectEntities(
  entityNames: string[],
  schema: string = 'public'
): Promise<IntrospectionResult> {
  logger.info(
    { entities: entityNames, schema },
    'Starting schema introspection for entities'
  );

  const tables: TableSchema[] = [];
  const errors: IntrospectionError[] = [];

  // Process entities sequentially to avoid pool exhaustion
  for (const entityName of entityNames) {
    logger.debug({ entity: entityName, schema }, 'Introspecting entity');

    try {
      const tableSchema = await introspectTable(schema, entityName);
      tables.push(tableSchema);
      logger.debug(
        {
          entity: entityName,
          columns: tableSchema.columns.length,
          constraints: tableSchema.constraints.length,
        },
        'Entity introspection complete'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorReason =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: string }).code)
          : 'unknown';

      logger.error(
        { entity: entityName, error: errorMessage, reason: errorReason },
        'Entity introspection failed'
      );

      errors.push({
        entity: entityName,
        message: errorMessage,
        reason: errorReason,
      });
    }
  }

  logger.info(
    {
      totalEntities: entityNames.length,
      successful: tables.length,
      failed: errors.length,
    },
    'Schema introspection complete'
  );

  return { tables, errors };
}

/**
 * Introspection service class (for future expansion)
 */
export class IntrospectionService {
  static introspectTable = introspectTable;
  static introspectEntities = introspectEntities;
}

// Temporary test function for verification
export async function testIntrospection() {
  const { getSyncEntities } = await import('../config/entities.js');
  const entities = getSyncEntities();
  logger.info({ entities }, 'Testing introspection for entities');
  const result = await IntrospectionService.introspectEntities(entities);
  logger.info(
    {
      tablesFound: result.tables.length,
      errorsCount: result.errors.length,
    },
    'Introspection test complete'
  );
  return result;
}
