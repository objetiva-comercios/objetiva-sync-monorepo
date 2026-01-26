/**
 * Zod validation schemas for PostgreSQL schema metadata
 *
 * These schemas provide runtime validation for introspection results
 * and are used to derive TypeScript types for consistency.
 */

import { z } from 'zod';

/**
 * Schema for column metadata
 */
export const columnMetadataSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.boolean(),
  default_value: z.string().nullable(),
  ordinal_position: z.number().int().positive(),
  column_comment: z.string().nullable(),
});

/**
 * Schema for constraint metadata
 */
export const constraintMetadataSchema = z.object({
  constraint_name: z.string(),
  constraint_type: z.enum(['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK']),
  columns: z.array(z.string()),
  foreign_table: z.string().optional(),
  foreign_columns: z.array(z.string()).optional(),
});

/**
 * Schema for complete table information
 */
export const tableSchemaSchema = z.object({
  table_name: z.string(),
  table_comment: z.string().nullable(),
  columns: z.array(columnMetadataSchema),
  constraints: z.array(constraintMetadataSchema),
});

/**
 * Schema for introspection errors
 */
export const introspectionErrorSchema = z.object({
  entity: z.string(),
  message: z.string(),
  reason: z.string(),
});

/**
 * Schema for complete introspection result
 */
export const introspectionResultSchema = z.object({
  tables: z.array(tableSchemaSchema),
  errors: z.array(introspectionErrorSchema),
});

// Export inferred types for consistency with TypeScript interfaces
export type ColumnMetadata = z.infer<typeof columnMetadataSchema>;
export type ConstraintMetadata = z.infer<typeof constraintMetadataSchema>;
export type TableSchema = z.infer<typeof tableSchemaSchema>;
export type IntrospectionError = z.infer<typeof introspectionErrorSchema>;
export type IntrospectionResult = z.infer<typeof introspectionResultSchema>;
