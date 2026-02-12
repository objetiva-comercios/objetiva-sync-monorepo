---
phase: 16-observability
plan: 04
subsystem: health-checks
tags: [health, observability, kubernetes, monitoring, probes]
dependency-graph:
  requires: [16-02]
  provides: [health-endpoints, component-probes, graceful-shutdown]
  affects: [17-deployment]
tech-stack:
  added: []
  patterns: [health-probes, graceful-shutdown, timeout-racing]
key-files:
  created:
    - objetiva-sync-gateway/src/routes/health.ts
    - objetiva-sync/src/dashboard/routes/health.ts
  modified:
    - objetiva-sync-gateway/src/app.ts
    - objetiva-sync/src/dashboard/routes/index.ts
decisions:
  - id: HEALTH-01
    decision: Gateway critical, scheduler optional in sync health
    rationale: Gateway connectivity is required for sync operations, scheduler state is informational
  - id: HEALTH-02
    decision: 3-second timeout on all health probes
    rationale: Kubernetes expects health checks within 5 seconds, 3s probe + 2s margin
metrics:
  duration: ~5 minutes
  completed: 2026-02-12
---

# Phase 16 Plan 04: Health Check Endpoints Summary

Enhanced health check endpoints for both gateway and sync modules with component probes.

## One-liner

Both modules expose /health with component-level probes, returning 200/503 based on critical service status.

## What Was Built

### Gateway Health Check (`objetiva-sync-gateway/src/routes/health.ts`)

- **Database Probe**: Executes `SELECT 1` with 3-second timeout
- **Response Format**:
  ```json
  {
    "status": "healthy|degraded",
    "timestamp": "ISO-8601",
    "uptime": 123.456,
    "checks": {
      "database": {
        "status": "up|down",
        "latencyMs": 5,
        "error": "optional error message"
      }
    }
  }
  ```
- **HTTP Status**: 200 when healthy, 503 when degraded
- **Graceful Shutdown**: Returns 503 when server closing

### Sync Module Health Check (`objetiva-sync/src/dashboard/routes/health.ts`)

- **Gateway Probe**: Fetches gateway's /health endpoint with 3-second timeout
- **Scheduler Probe**: Checks scheduler.isRunning via getStatus()
- **Response Format**:
  ```json
  {
    "status": "healthy|degraded",
    "timestamp": "ISO-8601",
    "uptime": 123.456,
    "checks": {
      "gateway": {
        "status": "up|down",
        "latencyMs": 15,
        "error": "optional error message"
      },
      "scheduler": {
        "status": "up|down",
        "error": "Scheduler not running"
      }
    }
  }
  ```
- **HTTP Status**: 200 when gateway up, 503 when gateway down
- **Graceful Shutdown**: Returns 503 when server closing

## Technical Decisions

1. **HEALTH-01: Gateway is critical, scheduler is optional**
   - Sync module returns 503 only when gateway unreachable
   - Scheduler down is informational (logged but doesn't affect status)

2. **HEALTH-02: 3-second probe timeout**
   - Kubernetes default probe timeout is 5 seconds
   - 3-second probe + 2-second margin = safe completion

3. **Promise.race for database timeout**
   - Prisma doesn't support query timeout directly
   - Race against setTimeout(3000) ensures fast failure

## Changes Made

### Gateway (`objetiva-sync-gateway`)

| File | Change |
|------|--------|
| `src/routes/health.ts` | Created - comprehensive health check with database probe |
| `src/app.ts` | Import and register health routes before other routes |

### Sync Module (`objetiva-sync`)

| File | Change |
|------|--------|
| `src/dashboard/routes/health.ts` | Created - health check with gateway and scheduler probes |
| `src/dashboard/routes/index.ts` | Import and register health routes with env.GATEWAY_URL |

## Verification Performed

1. Gateway build: `npm run build` - success
2. Sync module build: `npm run build` - success

## Usage

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5

readinessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
```

### Manual Testing

```bash
# Gateway health
curl http://localhost:3001/health

# Sync health
curl http://localhost:3000/health

# Test degraded state (stop database)
# Gateway returns 503 with database status "down"

# Test degraded state (stop gateway)
# Sync returns 503 with gateway status "down"
```

## Commits

| Commit | Description |
|--------|-------------|
| 69429c9 | feat(16-04): add comprehensive health check to gateway |
| 426028d | feat(16-04): add comprehensive health check to sync module |

## Next Phase Readiness

Ready for Phase 16 Plan 05: Complete metrics infrastructure with OpenTelemetry if planned.

**Current state:**
- OB-01: Prometheus metrics - Done (16-02)
- OB-02: Health check endpoints - Done (16-04)
- OB-03: Structured logging - Done (existing pino)
- OB-04: Error tracking - Partial (Sentry ready pattern)

No blockers. All verification criteria met.
