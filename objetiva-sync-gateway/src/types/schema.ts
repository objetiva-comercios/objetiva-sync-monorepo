/**
 * TypeScript interfaces for PostgreSQL schema metadata
 *
 * These types represent the structure of schema information retrieved
 * from PostgreSQL information_schema queries. All field names use snake_case
 * to match PostgreSQL naming conventions.
 */

/**
 * Metadata for a single column in a table
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
  ordinal_position: number;

  /** Comment/description for the column, if any */
  column_comment: string | null;
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

  /** Referenced table name (for FOREIGN KEY constraints only) */
  foreign_table?: string;

  /** Referenced columns (for FOREIGN KEY constraints only) */
  foreign_columns?: string[];
}

/**
 * Complete schema information for a single table
 */
export interface TableSchema {
  /** Name of the table */
  table_name: string;

  /** Comment/description for the table, if any */
  table_comment: string | null;

  /** List of columns in the table */
  columns: ColumnMetadata[];

  /** List of constraints on the table */
  constraints: ConstraintMetadata[];
}

/**
 * Error that occurred during introspection of a specific entity
 */
export interface IntrospectionError {
  /** Entity that failed introspection (table name, view name, etc.) */
  entity: string;

  /** Error message */
  message: string;

  /** Reason for the error (categorized) */
  reason: string;
}

/**
 * Complete result of a schema introspection operation
 */
export interface IntrospectionResult {
  /** Successfully introspected tables */
  tables: TableSchema[];

  /** Errors encountered during introspection */
  errors: IntrospectionError[];
}
