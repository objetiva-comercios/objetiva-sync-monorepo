/**
 * TypeScript interfaces for the code generation pipeline
 *
 * These types define the structure of options, results, and intermediate
 * representations used when regenerating Prisma models and Zod schemas
 * from PostgreSQL schema metadata.
 */

import type { ColumnMetadata, ConstraintMetadata } from '../types/schema.js';

/**
 * Hunk interface from the diff library
 * Represents a single block of changes in a diff
 */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Options for the regenerate command
 */
export interface RegenerateOptions {
  /** If true, compute and display diffs but do not write files */
  dryRun: boolean;

  /** If specified, only regenerate schemas for this entity */
  entity?: string;

  /** If true, skip running prisma generate (useful when gateway is running) */
  skipPrismaGenerate?: boolean;

  /** If true, skip writing files to disk (caller handles writing via pendingWrites) */
  skipFileWrites?: boolean;
}

/**
 * Result of a regeneration operation
 */
export interface RegenerateResult {
  /** Whether any changes were detected */
  hasChanges: boolean;

  /** Number of files written (0 if dryRun or skipFileWrites) */
  filesWritten: number;

  /** Number of entities checked */
  entitiesChecked: number;

  /** Diff results for all checked files */
  diffs: DiffResult[];

  /** Pending file writes (populated when skipFileWrites=true) */
  pendingWrites?: Array<{ filePath: string; content: string }>;
}

/**
 * Result of diffing a single file
 */
export interface DiffResult {
  /** Path/name of the file being diffed */
  fileName: string;

  /** Whether this file has changes */
  hasChanges: boolean;

  /** Summary statistics for this diff */
  summary: {
    /** Number of lines added */
    added: number;

    /** Number of lines removed */
    removed: number;
  };

  /** List of hunks (change blocks) from the diff */
  hunks: Hunk[];
}

/**
 * Configuration for a Prisma field including type and database annotation
 */
export interface PrismaFieldConfig {
  /** Prisma type (e.g., "String", "Int", "BigInt", "Decimal") */
  prismaType: string;

  /** Database-specific annotation (e.g., "@db.Text", "@db.Decimal(10,2)") */
  dbAnnotation?: string;
}

/**
 * A generated file with content and metadata
 */
export interface GeneratedFile {
  /** Entity name this file is for */
  entity: string;

  /** Generated file content */
  content: string;

  /** Relative path where this file should be written */
  filePath: string;
}

/**
 * Schema response from the introspection API
 * Matches the shape returned by Phase 2's /api/schemas/:entity endpoint
 */
export interface SchemaResponse {
  /** Entity name (matches the sync entity name) */
  entity: string;

  /** List of columns in this entity's table */
  columns: ColumnMetadata[];

  /** List of constraints on this entity's table */
  constraints: ConstraintMetadata[];
}
