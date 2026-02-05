/**
 * TypeScript interfaces for PostgreSQL schema metadata
 *
 * These types represent the structure of schema information retrieved
 * from the gateway API (/api/schemas endpoint). They match the gateway's
 * API response shapes to enable schema-based query validation.
 */

/**
 * Metadata for a single column in a table
 *
 * NOTE: Field names and types match the gateway's API response format:
 * - is_nullable is boolean (gateway normalizes from 'YES'/'NO')
 * - default_value (not column_default) matches gateway's field name
 */
export interface ColumnMetadata {
  /** Name of the column */
  column_name: string;

  /** PostgreSQL data type (normalized base type, e.g., 'text', 'integer', 'timestamp with time zone') */
  data_type: string;

  /** Whether the column accepts NULL values */
  is_nullable: boolean;

  /** Default value expression for the column, if any */
  default_value: string | null;

  /** Position of the column within the table (1-based) */
  ordinal_position?: number;

  /** Comment/description for the column, if any */
  column_comment?: string | null;
}

/**
 * Metadata for a table constraint (primary key, foreign key, unique, check)
 */
export interface ConstraintMetadata {
  /** Name of the constraint */
  constraint_name: string;

  /** Type of constraint */
  constraint_type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';

  /** Column name involved in this constraint */
  column_name: string;
}

/**
 * Schema response for a single entity from gateway API
 *
 * Returned by GET /api/schemas/:entity
 */
export interface SchemaResponse {
  /** Entity name (domain language, e.g., 'articulos', 'comprobantes_cabecera') */
  entity: string;

  /** List of columns in this entity's table */
  columns: ColumnMetadata[];

  /** List of constraints on this entity's table */
  constraints: ConstraintMetadata[];
}

/**
 * Response from fetching all schemas from gateway API
 *
 * Returned by GET /api/schemas
 */
export interface SchemasResponse {
  /** Array of schema information for all sync entities */
  schemas: SchemaResponse[];
}
