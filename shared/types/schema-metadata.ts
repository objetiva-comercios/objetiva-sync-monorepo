/**
 * Schema Metadata Types
 *
 * Defines the structure for schema metadata that enables dynamic
 * field operations in ingestion and validation.
 *
 * SINGLE SOURCE OF TRUTH: Both objetiva-sync and objetiva-sync-gateway
 * import these types from this shared location.
 */

/**
 * Metadata for a single column in a PostgreSQL table
 * Used for query validation and schema introspection
 */
export interface ColumnMetadata {
  /** Name of the column */
  column_name: string;

  /** PostgreSQL data type (normalized base type, e.g., 'text', 'integer', 'timestamp') */
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

  /** Columns involved in this constraint */
  columns: string[];
}

/**
 * Complete schema metadata for an entity
 * Includes columns and constraints from PostgreSQL introspection
 */
export interface TableSchemaMetadata {
  /** Entity/table name */
  entity: string;

  /** List of columns with their metadata */
  columns: ColumnMetadata[];

  /** List of constraints on this table */
  constraints: ConstraintMetadata[];
}

/**
 * Validation rules that can be specified in PostgreSQL column comments
 * Format: "Description | {\"validation\": \"positive\", \"example\": \"123\"}"
 */
export interface ValidationRule {
  /** Validation type: positive, nonnegative, int, email, url */
  validation?: 'positive' | 'nonnegative' | 'int' | 'email' | 'url';
  /** Example value for documentation */
  example?: string;
  /** Minimum length for strings */
  minLength?: number;
  /** Maximum length for strings */
  maxLength?: number;
}

/**
 * Metadata for an entity schema
 * Generated from PostgreSQL introspection
 */
export interface EntityMetadata<TKeyFields extends readonly string[] = readonly string[]> {
  /** Entity name (singular, e.g., 'articulo') */
  entity: string;

  /** PostgreSQL table name (plural, e.g., 'articulos') */
  tableName: string;

  /**
   * Fields used for upsert operations (PRIMARY KEY + NOT NULL)
   * These fields identify unique records for update vs insert logic
   */
  keyFields: TKeyFields;

  /**
   * System-managed fields (immutable names)
   * These are automatically set by the gateway, not from client payload
   */
  systemFields: readonly ['erp_sincronizado', 'erp_fecha_sync', 'actualizado', 'creado'];

  /**
   * Business validation rules per field
   * Extracted from PostgreSQL COMMENT ON COLUMN
   */
  validations: Record<string, ValidationRule>;
}

/**
 * Helper type to extract key field names from metadata
 */
export type KeyFieldsOf<T extends EntityMetadata> = T['keyFields'][number];

/**
 * Helper type to extract system field names from metadata
 */
export type SystemFieldsOf<T extends EntityMetadata> = T['systemFields'][number];
