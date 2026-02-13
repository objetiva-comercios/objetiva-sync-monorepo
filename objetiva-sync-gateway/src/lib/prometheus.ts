import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client'

// Create custom registry to avoid conflicts
export const register = new Registry()

// Collect default Node.js metrics (memory, CPU, event loop lag)
collectDefaultMetrics({
  register,
  prefix: 'gateway_'
})

// HTTP request duration histogram
// Buckets: 1ms to 10s covering typical API response times
export const httpDuration = new Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
})

// HTTP request counter
export const httpRequestsTotal = new Counter({
  name: 'gateway_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
})

// Sync operation duration histogram
// Buckets: 0.1s to 102.4s covering small batches to large syncs
// Using exponential buckets: [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4]
export const syncDuration = new Histogram({
  name: 'gateway_sync_operation_duration_seconds',
  help: 'Duration of sync operations in seconds',
  labelNames: ['entity_type', 'source_id', 'sync_type'],
  buckets: [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4],
  registers: [register]
})

// Sync record counter
// Tracks records processed per entity type, source, and operation result
export const syncRecordsTotal = new Counter({
  name: 'gateway_sync_records_total',
  help: 'Total number of records processed during sync operations',
  labelNames: ['entity_type', 'source_id', 'operation'], // operation: inserted, updated, failed
  registers: [register]
})
