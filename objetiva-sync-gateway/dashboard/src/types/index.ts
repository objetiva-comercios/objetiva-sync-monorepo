export interface IngestionStats {
  total: number
  processed: number
  failed: number
  ratePerSecond: number
  lastUpdate: string
}

export interface EntityStats {
  entity: string
  received: number
  processed: number
  failed: number
  lastBatch?: {
    size: number
    duration: number
    timestamp: string
  }
}

export interface BatchOperation {
  id: string
  entity: string
  queryName?: string
  size: number
  status: 'success' | 'failed' | 'partial' | 'cancelled' | 'timeout'
  processed: number
  failed: number
  duration: number
  timestamp: string
  errors?: string[]
  // Progress fields for sync jobs
  currentBatch?: number
  totalBatches?: number
  estimatedRemainingMs?: number
  isComplete?: boolean
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  uptime: number
  memoryUsage: number
  cpuUsage: number
  activeConnections: number
}

export interface ActivityItem {
  id: string
  type: 'ingestion' | 'error' | 'warning' | 'info'
  entity?: string
  message: string
  timestamp: string
  metadata?: Record<string, any>
}

// Schema comparison types (mirror of gateway EntityComparison shape)
export interface FieldLayerData {
  data_type: string
  is_nullable: boolean
}

export interface ComparisonFieldRow {
  column_name: string
  status: 'aligned' | 'mismatched' | 'missing'
  postgresql: FieldLayerData | null
  compiled: FieldLayerData | null
  sync: FieldLayerData | null
}

export interface EntityComparison {
  entity: string
  sync_reported: boolean
  summary: {
    aligned: number
    mismatched: number
    missing: number
  }
  fields: ComparisonFieldRow[]
}
