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
