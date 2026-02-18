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
