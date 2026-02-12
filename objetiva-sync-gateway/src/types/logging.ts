/**
 * Logging types for batch ingestion observability
 */

export interface BatchMetadata {
  /** Unique sync session identifier */
  syncId?: string
  /** Query configuration ID */
  queryId?: number
  /** Human-readable query name */
  queryName?: string
  /** Current batch number (1-indexed) */
  batchNumber?: number
  /** Total batches in sync job */
  totalBatches?: number
  /** Which sync client sent this batch (for multi-source tracking) */
  originSource?: string
}

export interface IngestionLogEntry {
  /** Entity type being ingested */
  entity: string
  /** Current batch number (1-indexed) */
  batchNumber: number
  /** Total batches in sync job */
  totalBatches: number
  /** Number of records successfully inserted */
  inserted: number
  /** Number of records successfully updated */
  updated: number
  /** Number of records that failed validation/ingestion */
  failed: number
  /** Duration of ingestion in milliseconds */
  durationMs: number
  /** Query metadata if available */
  metadata?: BatchMetadata
  /** Sample validation errors (max 3) */
  sampleErrors?: Array<{
    index: number
    identifier: string
    error: string
    code: string
  }>
}
