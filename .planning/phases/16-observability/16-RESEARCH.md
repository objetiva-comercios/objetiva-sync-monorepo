# Phase 16: Observability - Research

**Researched:** 2026-02-12
**Domain:** Production observability for Node.js/Fastify microservices
**Confidence:** HIGH

## Summary

Phase 16 implements production-ready observability for the objetiva-sync monorepo with structured logging, health checks, and Prometheus metrics. The research confirms that the existing stack (Pino 9.5.0 + Fastify) provides robust foundation for observability, with clear patterns for correlation IDs, metrics collection, and health endpoints.

**Key findings:**
- Pino is already installed (both modules) and provides ndjson output by default — no additional logging library needed
- `prom-client` is the de facto standard for Prometheus metrics in Node.js with 88.7 benchmark score
- `cls-rtracer` enables automatic correlation ID tracking across async operations in Fastify without manual propagation
- Health checks follow simple pattern: return 200 when healthy, 503 when degraded (built into Fastify core)
- W3C Trace Context (traceparent header) is the emerging standard for trace propagation between services

**Primary recommendation:** Use existing Pino for structured logging with child loggers for correlation IDs, add prom-client for metrics, implement lightweight health check directly in Fastify without external plugins, and optionally use cls-rtracer for automatic async context tracking.

## Standard Stack

The established libraries/tools for Node.js observability:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pino | 9.5.0 | Structured JSON logging | Already installed, fastest Node.js logger, ndjson by default, 75.5 benchmark score |
| prom-client | ^15.1.3 | Prometheus metrics | De facto standard for Node.js Prometheus integration, 88.7 benchmark score |
| cls-rtracer | ^2.6.3 | Correlation ID tracking | Automatic AsyncLocalStorage-based correlation IDs for Fastify, batteries included |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastify-healthcheck | ^4.x | Health check plugin | Only if complex health checks needed (DB/Redis probes) — simple cases don't need plugin |
| @opentelemetry/instrumentation-pino | ^0.43.0 | OpenTelemetry integration | Future: if full distributed tracing needed (currently COULD requirement) |
| elastic/node-traceparent | ^1.0.1 | W3C traceparent parsing | Future: if implementing W3C Trace Context propagation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cls-rtracer | Manual correlation ID propagation | Simpler but requires passing IDs through all function calls |
| prom-client | OpenTelemetry metrics | More complex setup, overkill for current requirements |
| fastify-healthcheck | Manual `/health` route | Simpler for basic checks, lose under-pressure integration |

**Installation:**
```bash
# Gateway
cd objetiva-sync-gateway
npm install prom-client cls-rtracer

# Sync
cd objetiva-sync
npm install prom-client cls-rtracer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── logger.ts              # Existing Pino logger (enhance with correlation)
│   ├── metrics.ts             # Existing metrics collector (enhance with Prometheus)
│   └── correlation.ts         # NEW: cls-rtracer configuration
├── routes/
│   ├── health.ts              # NEW: Health check endpoint
│   └── metrics.ts             # NEW: Prometheus /metrics endpoint
└── middleware/
    └── logging.ts             # NEW: Request logging with correlation IDs
```

### Pattern 1: Correlation ID Tracking with cls-rtracer
**What:** Automatic correlation ID generation and propagation through async operations using AsyncLocalStorage
**When to use:** When you need to trace requests across services and through async call chains
**Example:**
```typescript
// Source: https://github.com/puzpuzpuz/cls-rtracer
import rTracer from 'cls-rtracer'
import Fastify from 'fastify'

const app = Fastify({ logger: true })

// Register cls-rtracer plugin (must be first)
await app.register(rTracer.fastifyPlugin, {
  // Use existing X-Request-Id header if present, otherwise generate UUID
  useHeader: true,
  headerName: 'X-Correlation-ID',
  echoHeader: true
})

// Add correlation ID to all logs
app.addHook('onRequest', async (request, reply) => {
  const correlationId = rTracer.id()
  request.log = request.log.child({ correlationId })
})

// Access correlation ID anywhere in your code
import rTracer from 'cls-rtracer'

function someServiceFunction() {
  const correlationId = rTracer.id()
  logger.info({ correlationId }, 'Processing in service layer')
}
```

### Pattern 2: Structured Logging with Pino Child Loggers
**What:** Create child loggers with bound context for each request or operation
**When to use:** For adding consistent context (correlationId, entityName, sourceId) to all log entries in a scope
**Example:**
```typescript
// Source: https://context7.com/pinojs/pino
import pino from 'pino'

const baseLogger = pino()

// Create child logger with correlation ID and entity context
const syncLogger = baseLogger.child({
  correlationId: 'req-123',
  entityType: 'articulo',
  sourceId: 'erp-sql-server'
})

syncLogger.info({ recordCount: 1500 }, 'Starting sync operation')
// {"level":30,"time":1707724800000,"correlationId":"req-123","entityType":"articulo","sourceId":"erp-sql-server","recordCount":1500,"msg":"Starting sync operation"}

// Nested child inherits parent bindings
const batchLogger = syncLogger.child({ batchNumber: 3 })
batchLogger.info('Processing batch')
// {"level":30,"time":1707724801000,"correlationId":"req-123","entityType":"articulo","sourceId":"erp-sql-server","batchNumber":3,"msg":"Processing batch"}
```

### Pattern 3: Prometheus Histogram for Duration Metrics
**What:** Track request/operation duration with histogram buckets for percentile calculation
**When to use:** For measuring sync duration, HTTP request latency, database query duration
**Example:**
```typescript
// Source: https://context7.com/siimon/prom-client
import { Histogram, exponentialBuckets } from 'prom-client'

const syncDuration = new Histogram({
  name: 'sync_operation_duration_seconds',
  help: 'Duration of sync operations in seconds',
  labelNames: ['entity_type', 'source_id', 'sync_type'],
  // Exponential buckets: 0.1s to 102.4s (covers 100ms to 2min range)
  buckets: exponentialBuckets(0.1, 2, 11) // [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4]
})

// Use startTimer for automatic duration measurement
async function performSync(entityType: string, sourceId: string, syncType: string) {
  const end = syncDuration.startTimer({ entity_type: entityType, source_id: sourceId, sync_type: syncType })
  try {
    await syncOperation()
  } finally {
    end() // Automatically records duration
  }
}
```

### Pattern 4: Health Check with Degraded States
**What:** Return 200 when healthy, 503 when degraded, with status details in response body
**When to use:** For Kubernetes liveness/readiness probes and monitoring systems
**Example:**
```typescript
// Source: https://github.com/fastify/fastify (derived from return503OnClosing pattern)
app.get('/health', async (request, reply) => {
  const dbHealthy = await checkDatabaseConnection()
  const gatewayReachable = await checkGatewayConnection()

  const healthy = dbHealthy && gatewayReachable

  reply.code(healthy ? 200 : 503).send({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'up' : 'down',
      gateway: gatewayReachable ? 'up' : 'down'
    }
  })
})
```

### Pattern 5: Prometheus Metrics Endpoint
**What:** Expose /metrics endpoint returning Prometheus-formatted metrics
**When to use:** For Prometheus scraping, standard across all services
**Example:**
```typescript
// Source: https://context7.com/siimon/prom-client
import { register, collectDefaultMetrics } from 'prom-client'

// Collect default Node.js metrics (memory, CPU, event loop lag)
collectDefaultMetrics({ prefix: 'sync_' })

app.get('/metrics', async (request, reply) => {
  try {
    reply.header('Content-Type', register.contentType)
    const metrics = await register.metrics()
    return reply.send(metrics)
  } catch (err) {
    reply.code(500).send({ error: 'Failed to collect metrics' })
  }
})
```

### Pattern 6: Trace Context Propagation (W3C)
**What:** Propagate trace context between services using W3C traceparent header
**When to use:** When implementing distributed tracing (COULD requirement OB-06)
**Example:**
```typescript
// Source: https://www.w3.org/TR/trace-context/ + https://oneuptime.com/blog/post/2026-02-06-w3c-trace-context-format-traceparent-tracestate/view
// Format: traceparent: 00-{trace-id}-{parent-id}-{trace-flags}
// Example: traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01

// Outgoing request (sync to gateway)
const traceId = generateTraceId() // 32 hex chars
const spanId = generateSpanId()   // 16 hex chars
const traceparent = `00-${traceId}-${spanId}-01`

await fetch('https://gateway/api/sync', {
  headers: {
    'traceparent': traceparent,
    'X-Correlation-ID': correlationId
  }
})

// Incoming request (gateway receiving sync)
app.addHook('onRequest', (request, reply, done) => {
  const traceparent = request.headers['traceparent']
  if (traceparent) {
    const [version, traceId, parentId, flags] = traceparent.split('-')
    request.log = request.log.child({ traceId, parentId })
  }
  done()
})
```

### Anti-Patterns to Avoid
- **Manual correlation ID passing:** Don't pass correlation IDs through every function parameter — use AsyncLocalStorage (cls-rtracer) instead
- **console.log in production:** Unstructured, slow, no log levels — always use Pino
- **Too many histogram buckets:** Don't use 50+ buckets (cardinality explosion) — 10-15 buckets aligned with SLOs is sufficient
- **Logging sensitive data:** Never log passwords, tokens, PII — use Pino's redaction feature
- **Synchronous logging:** Don't use sync file writes — Pino streams asynchronously by default

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async context tracking | Custom context passing through function params | cls-rtracer with AsyncLocalStorage | Edge cases with promise chains, error boundaries, and async iterators are complex |
| Correlation ID generation | Custom UUID generation per request | cls-rtracer (generates UUID v1 automatically) | Handles header detection (X-Request-ID), echo to response, and storage |
| Prometheus metrics format | Custom text formatting for /metrics | prom-client register.metrics() | Correct OpenMetrics format with escaping, buckets, quantiles |
| Log rotation | Custom file rotation logic | Pino's destination + external log rotation (logrotate) | File descriptor management, atomic renames, signal handling |
| Health check probe logic | Custom readiness/liveness checks | Fastify's built-in hooks + simple route | Kubernetes probe timing, graceful shutdown coordination |

**Key insight:** Observability is a solved problem in Node.js ecosystem. The complexity is in the details (async boundaries, metric cardinality, log shipping) — production-tested libraries handle these edge cases better than custom code.

## Common Pitfalls

### Pitfall 1: AsyncLocalStorage Performance Impact
**What goes wrong:** Using AsyncLocalStorage (cls-rtracer) adds ~3-5% overhead to all async operations
**Why it happens:** Node.js Async Hooks API has inherent cost for tracking async context
**How to avoid:** Accept the tradeoff for correlation IDs, or use manual propagation for ultra-high-throughput scenarios (>50k req/s)
**Warning signs:** CPU usage increases without load increase, event loop lag grows

### Pitfall 2: Histogram Cardinality Explosion
**What goes wrong:** Adding too many label combinations (entity × source × status) creates thousands of time series
**Why it happens:** Each unique label combination creates a new Prometheus time series
**How to avoid:** Limit to 3-4 labels max, use high-cardinality values (like user IDs) in logs, not metrics
**Warning signs:** Prometheus scrape timeouts, memory growth in Prometheus, /metrics endpoint slowness

### Pitfall 3: Missing Correlation IDs in Gateway Responses
**What goes wrong:** Sync module logs show correlation ID, but gateway logs don't — can't trace end-to-end
**Why it happens:** Gateway doesn't extract X-Correlation-ID from incoming requests
**How to avoid:** Both sync and gateway must use cls-rtracer with same header name
**Warning signs:** Cannot search logs by correlation ID to find gateway processing of sync request

### Pitfall 4: Health Check False Positives During Shutdown
**What goes wrong:** /health returns 200 OK even when server is shutting down, Kubernetes sends traffic to dying pod
**Why it happens:** Health check doesn't track Fastify close() state
**How to avoid:** Set flag on 'onClose' hook, return 503 when closing
**Warning signs:** Increased 502/504 errors during deployments, "connection refused" in logs

### Pitfall 5: Log Volume Explosion
**What goes wrong:** Every batch operation logs 10+ lines, production generates 100GB/day of logs
**Why it happens:** Debug-level logging in production, logging inside tight loops
**How to avoid:** Use LOG_LEVEL=info in production, batch logs (e.g., "processed 500 records" not "processed record 1", "processed record 2"...)
**Warning signs:** Disk full alerts, log aggregation costs spike, slow log queries

### Pitfall 6: Prometheus Histogram Bucket Misalignment
**What goes wrong:** All sync operations fall into last bucket (+Inf), can't calculate p95/p99
**Why it happens:** Buckets too small for actual latency distribution (e.g., buckets up to 1s but syncs take 10s)
**How to avoid:** Analyze actual latency distribution first, then choose buckets covering 10th to 99th percentile
**Warning signs:** All observations in +Inf bucket, cannot calculate useful percentiles

## Code Examples

Verified patterns from official sources:

### Fastify Request Logging with Correlation IDs
```typescript
// Source: https://context7.com/pinojs/pino + https://github.com/puzpuzpuz/cls-rtracer
import Fastify from 'fastify'
import rTracer from 'cls-rtracer'
import { logger } from './lib/logger.js'

const app = Fastify({
  logger: logger as any,
  disableRequestLogging: true // We'll log manually with correlation IDs
})

// Register correlation ID tracking (MUST be first plugin)
await app.register(rTracer.fastifyPlugin, {
  useHeader: true,
  headerName: 'X-Correlation-ID',
  echoHeader: true
})

// Add correlation ID to request logger
app.addHook('onRequest', async (request, reply) => {
  const correlationId = rTracer.id()
  request.log = request.log.child({ correlationId })
})

// Log requests with correlation ID
app.addHook('onResponse', async (request, reply) => {
  request.log.info({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime()
  }, 'Request completed')
})
```

### Sync Operation Metrics
```typescript
// Source: https://context7.com/siimon/prom-client
import { Histogram, Counter, exponentialBuckets } from 'prom-client'

// Duration histogram with entity and source labels
const syncDuration = new Histogram({
  name: 'sync_operation_duration_seconds',
  help: 'Duration of sync operations in seconds',
  labelNames: ['entity_type', 'source_id', 'sync_type'],
  buckets: exponentialBuckets(0.1, 2, 11) // 0.1s to 102.4s
})

// Record count per sync
const syncRecordsTotal = new Counter({
  name: 'sync_records_total',
  help: 'Total number of records processed',
  labelNames: ['entity_type', 'source_id', 'operation'] // operation: inserted|updated|failed
})

// Example usage in sync engine
async function syncEntity(entityType: string, sourceId: string, syncType: string) {
  const end = syncDuration.startTimer({
    entity_type: entityType,
    source_id: sourceId,
    sync_type: syncType
  })

  try {
    const result = await performSync()

    syncRecordsTotal.inc({ entity_type: entityType, source_id: sourceId, operation: 'inserted' }, result.inserted)
    syncRecordsTotal.inc({ entity_type: entityType, source_id: sourceId, operation: 'updated' }, result.updated)
    syncRecordsTotal.inc({ entity_type: entityType, source_id: sourceId, operation: 'failed' }, result.failed)

    return result
  } finally {
    end()
  }
}
```

### Health Check with Component Status
```typescript
// Source: Fastify patterns + https://microservices.io/patterns/observability/health-check-api.html
import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
    const checks = {
      database: await checkDatabase(),
      gateway: await checkGateway(),
      scheduler: await checkScheduler()
    }

    const healthy = Object.values(checks).every(status => status === 'up')

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks
    })
  })
}

async function checkDatabase(): Promise<'up' | 'down'> {
  try {
    await db.execute('SELECT 1')
    return 'up'
  } catch {
    return 'down'
  }
}
```

### Gateway HTTP Metrics
```typescript
// Source: https://context7.com/siimon/prom-client
import { Histogram, Counter, linearBuckets } from 'prom-client'

// HTTP request duration
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
})

// HTTP request count
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code']
})

// Middleware to track HTTP metrics
app.addHook('onRequest', async (request, reply) => {
  request.startTime = Date.now()
})

app.addHook('onResponse', async (request, reply) => {
  const duration = (Date.now() - request.startTime) / 1000
  const route = request.routeOptions.url || request.url
  const labels = {
    method: request.method,
    route: route,
    status_code: reply.statusCode.toString()
  }

  httpDuration.observe(labels, duration)
  httpRequests.inc(labels)
})
```

### Prisma Query Duration Metrics
```typescript
// Source: https://www.prisma.io/docs/concepts/components/prisma-client/middleware + prom-client patterns
import { Histogram } from 'prom-client'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const queryDuration = new Histogram({
  name: 'prisma_query_duration_seconds',
  help: 'Prisma query duration in seconds',
  labelNames: ['model', 'action'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
})

// Middleware to track query duration
prisma.$use(async (params, next) => {
  const end = queryDuration.startTimer({
    model: params.model || 'unknown',
    action: params.action
  })

  try {
    return await next(params)
  } finally {
    end()
  }
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Winston logger | Pino logger | ~2019 | 3-5x faster logging, native ndjson output |
| cls-hooked (based on async_hooks) | AsyncLocalStorage API (Node.js 14+) | Node 14.0 (2020) | More stable, native API, better performance |
| Custom traceparent format | W3C Trace Context standard | W3C Recommendation 2020 | Cross-vendor interoperability for distributed tracing |
| Prometheus Summaries | Prometheus Histograms | ~2018 | Server-side quantile calculation, aggregation across instances |
| Custom request ID middleware | cls-rtracer | v1.0 (2019) | Automatic async context propagation, zero boilerplate |

**Deprecated/outdated:**
- **cls-hooked:** Replaced by cls-rtracer v2+ using native AsyncLocalStorage (requires Node 12.17+, 13.14+, or 14+)
- **pino-http with manual request ID:** Use cls-rtracer for automatic correlation ID injection instead
- **Prometheus Summary metrics:** Use Histogram instead (summaries cannot be aggregated across instances)
- **Manual /health endpoint with external process checks:** Use fastify-healthcheck plugin for complex health checks (DB, Redis, etc.)

## Open Questions

Things that couldn't be fully resolved:

1. **Should we use cls-rtracer or manual correlation ID propagation?**
   - What we know: cls-rtracer adds 3-5% overhead but eliminates boilerplate
   - What's unclear: Whether this overhead is acceptable for 100k+ record syncs
   - Recommendation: Start with cls-rtracer, profile in production, fall back to manual if needed

2. **How many histogram buckets for sync operations?**
   - What we know: Sync durations range from 100ms (small batches) to 2+ minutes (100k records)
   - What's unclear: Exact distribution without production data
   - Recommendation: Use exponentialBuckets(0.1, 2, 11) = [0.1s to 102.4s], adjust after first week

3. **Should gateway health check probe database connection?**
   - What we know: Probing database on every health check adds latency and connection overhead
   - What's unclear: Whether Kubernetes liveness checks should fail on temporary DB unavailability
   - Recommendation: Use separate /health (lightweight) and /ready (checks DB) endpoints

4. **Should correlation IDs be generated by sync or required from client?**
   - What we know: cls-rtracer generates UUID if X-Correlation-ID header missing
   - What's unclear: Whether sync dashboard should generate and display correlation IDs for user-initiated syncs
   - Recommendation: Auto-generate in sync module, optionally accept from client (follow cls-rtracer defaults)

## Sources

### Primary (HIGH confidence)
- [/pinojs/pino](https://context7.com/pinojs/pino) - Structured logging, child loggers, ndjson format, Fastify integration
- [/siimon/prom-client](https://context7.com/siimon/prom-client) - Histogram/Counter metrics, bucket configuration, /metrics endpoint
- [/fastify/fastify](https://context7.com/fastify/fastify) - Health check patterns, plugin system, hooks
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/) - Official traceparent header format
- [cls-rtracer GitHub](https://github.com/puzpuzpuz/cls-rtracer) - AsyncLocalStorage-based correlation IDs for Fastify

### Secondary (MEDIUM confidence)
- [Correlation IDs in Practice](https://skonves.github.io/pages/correlation-ids.html) - Design patterns for distributed tracing
- [Prometheus Histograms and Summaries](https://prometheus.io/docs/practices/histograms/) - Official Prometheus bucket guidance
- [Better Stack: Node.js Logging Best Practices](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/) - Production logging patterns (2026)
- [OneUptime: Distributed Tracing Context Propagation](https://oneuptime.com/blog/post/2026-02-02-distributed-tracing-context-propagation/view) - W3C traceparent implementation
- [Microservices Pattern: Health Check API](https://microservices.io/patterns/observability/health-check-api.html) - Health check design patterns

### Tertiary (LOW confidence)
- Various blog posts on Node.js observability (2024-2026) - Validated against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pino and prom-client verified in Context7, cls-rtracer in npm/GitHub
- Architecture: HIGH - All patterns verified in official documentation with code examples
- Pitfalls: MEDIUM - Based on community experience and production reports, not official docs

**Research date:** 2026-02-12
**Valid until:** 2026-03-15 (30 days - stable ecosystem, minor version updates expected)

**Current environment:**
- Pino 9.5.0 already installed in both modules
- Fastify 5.2.0 (sync) and 4.28.1 (gateway)
- No observability plugins currently installed
- Existing metrics collector in gateway (in-memory, not Prometheus-compatible)
- Basic /health endpoint exists (simple JSON response, no probes)
