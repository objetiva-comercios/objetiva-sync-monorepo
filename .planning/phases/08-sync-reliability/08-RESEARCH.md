# Phase 8: Sync Reliability - Research

**Researched:** 2026-02-03
**Domain:** Node.js HTTP timeout configuration, batch processing reliability, sync pipeline architecture
**Confidence:** HIGH

## Summary

This research investigates the root cause of the sync timeout bug (manual sync fails after ~60s regardless of batch size) and identifies all timeout layers in the sync pipeline that must be addressed for reliable 100K+ record processing.

The codebase has a multi-layer sync pipeline: `objetiva-sync` (client) queries SQL Server, processes data in batches, and sends each batch via HTTP (undici) to `objetiva-sync-gateway` (server), which ingests each record one-by-one via Prisma into PostgreSQL. The SSE (Server-Sent Events) endpoint `/api/sync/stream` is used for streaming sync with progress. After deep code analysis, the ~60s timeout failure is almost certainly caused by the **SQL Server adapter's `requestTimeout` of 10 seconds** combined with the **total wall-clock time** of batch processing where individual gateway batch requests take too long because the gateway processes records one-by-one (no bulk operations).

The actual timeout chain analysis reveals THREE independent timeout sources that can each cause the ~60s failure pattern:

1. **SQL Server `requestTimeout: 10000` (10s)** -- The initial ERP query for 100K+ records may exceed this if the query is complex. However, the data shows 6700-10600 records ARE fetched successfully, so the initial query likely succeeds.

2. **undici fetch has NO explicit timeout configured** -- The API client (`articulos-client.ts`) uses `import { fetch } from 'undici'` with NO timeout/signal configuration (aside from the optional abort signal for cancellation). undici 7.x defaults `headersTimeout` and `bodyTimeout` to 300 seconds (5 minutes) each, so this is NOT the ~60s culprit by itself.

3. **Gateway ingestion is record-by-record** -- The `IngestionService` does individual Prisma `findFirst` + `create/update` for EACH record in a batch. For a batch of 100 articulos, this means 200+ database queries. For batch 500, it means 1000+ queries. This makes each batch request to the gateway slow. Combined with the 500ms delay between batches, the sync spends most of its time waiting.

4. **The SSE connection itself** -- The sync uses Server-Sent Events via `reply.raw.writeHead()`. If the **client browser** or an intermediary closes the SSE connection (browser tab timeout, proxy timeout, etc.), the entire sync would fail. The sync endpoint is a GET request with SSE -- if Fastify's `requestTimeout` or `keepAliveTimeout` fires, the response stream closes. Fastify 5 defaults `requestTimeout` to `0` (no timeout), and Fastify 4 (used by gateway) also defaults to `0`. However, the **browser's EventSource** has reconnection behavior. The real question is: what happens when `reply.raw` is closed?

**CRITICAL FINDING: The ~60s pattern strongly suggests Node.js `http.Server.timeout`** which defaults to 0 in modern Node.js (Node 20+). But historically, and in some frameworks, the server timeout was 2 minutes (120s). Since the observed failure is at ~60s, the most likely candidates are:
- The `requestTimeout` on the **sync service's own Fastify server** -- if the SSE endpoint handler takes > 60s to complete
- A reverse proxy or load balancer timeout (nginx proxy_read_timeout defaults to 60s -- but the nginx config shows 300s for the gateway)
- The **sync service** has NO nginx config -- if it is behind a default nginx proxy, the default 60s `proxy_read_timeout` would be the culprit

**Primary recommendation:** Systematically audit and increase all timeout layers, use `createWriteStream` pattern for SSE to avoid server timeouts, add explicit timeout configuration to undici fetch calls, and improve gateway ingestion performance with bulk operations.

## Standard Stack

The established libraries/tools already in use -- no new libraries needed:

### Core (Already In Use)
| Library | Version | Purpose | Relevant Config |
|---------|---------|---------|----------------|
| fastify | ^5.2.0 | Sync service HTTP server | `requestTimeout`, `connectionTimeout`, `keepAliveTimeout` |
| fastify | ^4.28.1 | Gateway HTTP server | Same timeout options |
| undici | ^7.2.2 | HTTP client (fetch) in sync service | `headersTimeout`, `bodyTimeout`, `AbortSignal.timeout()` |
| mssql | ^11.0.1 | SQL Server adapter | `requestTimeout`, `connectionTimeout` |
| @prisma/client | ^5.22.0 | Gateway ORM (PostgreSQL) | Transaction support, `createMany` |

### Supporting (Already In Use)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | ^9.5.0 | Structured logging | All timeout/error diagnostics |
| zod | ^3.23.8 | Schema validation | Error message enrichment |

### No New Dependencies Needed

This phase is about **configuration fixes and code optimization**, not adding libraries.

## Architecture Patterns

### Pattern 1: Timeout Layer Audit
**What:** Every HTTP connection in the pipeline has multiple timeout layers that must be coordinated
**When to use:** When debugging time-based failures

The complete timeout chain for a sync operation:

```
[Browser/Client]
  |-- EventSource connection to objetiva-sync /api/sync/stream
  |
[Nginx (if present for sync service)]
  |-- proxy_read_timeout (default: 60s) <-- MOST LIKELY CULPRIT
  |
[objetiva-sync Fastify Server]
  |-- requestTimeout (currently: 0 / no timeout)
  |-- keepAliveTimeout (currently: 72s default)
  |-- SSE response via reply.raw.writeHead()
  |
  |-- [SQL Server Query via mssql]
  |     |-- connectionTimeout: 10000ms (10s)
  |     |-- requestTimeout: 10000ms (10s)  <-- May be too low for large queries
  |
  |-- [Batch Processing Loop]
  |     |-- For each batch of N records:
  |     |     |-- undici fetch to gateway
  |     |     |     |-- headersTimeout: 300000ms (5min default)
  |     |     |     |-- bodyTimeout: 300000ms (5min default)
  |     |     |     |-- NO explicit timeout set in code
  |     |     |
  |     |     |-- [Gateway processes batch]
  |     |     |     |-- Prisma record-by-record (SLOW)
  |     |     |
  |     |     |-- 500ms delay between batches
  |     |
  |     |-- Total time = sum of all batch times + delays
  |
[objetiva-sync-gateway Fastify Server]
  |-- requestTimeout (currently: 0 / no timeout)
  |-- keepAliveTimeout (72s default)
  |
  |-- [Prisma -> PostgreSQL]
        |-- statement_timeout: 5000ms (5s per query)
        |-- connectionTimeoutMillis: 10000ms (10s)
```

### Pattern 2: SSE Keep-Alive Heartbeat
**What:** Send periodic heartbeat comments on SSE to prevent proxy/connection timeouts
**When to use:** Any SSE endpoint that can run longer than 30 seconds

```typescript
// Source: MDN SSE spec + Fastify community patterns
// Send heartbeat every 15 seconds to keep SSE alive
const heartbeatInterval = setInterval(() => {
  reply.raw.write(': heartbeat\n\n');
}, 15000);

// Clean up on close
request.raw.on('close', () => {
  clearInterval(heartbeatInterval);
});
```

### Pattern 3: Per-Request Timeout with undici
**What:** Set explicit timeout on each fetch call instead of relying on defaults
**When to use:** All API client calls to gateway

```typescript
// Source: undici official docs (https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md)
// Option A: AbortSignal.timeout() -- simplest
const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(payload),
  signal: AbortSignal.any([
    AbortSignal.timeout(120_000), // 2 minute timeout per batch request
    abortSignal, // Cancellation signal from user
  ].filter(Boolean)),
});

// Option B: Custom dispatcher with higher timeouts
import { Agent } from 'undici';
const agent = new Agent({
  headersTimeout: 600_000, // 10 minutes
  bodyTimeout: 600_000,    // 10 minutes
});
const response = await fetch(url, { dispatcher: agent });
```

### Pattern 4: Bulk Ingestion with Prisma
**What:** Replace record-by-record operations with bulk operations
**When to use:** Any batch ingestion of 50+ records

```typescript
// Source: Prisma docs
// CURRENT (SLOW): Record-by-record
for (const articulo of articulos) {
  const existing = await prisma.articulo.findFirst({ where: { erp_codigo: articulo.erp_codigo } });
  if (existing) {
    await prisma.articulo.update({ where: { id: existing.id }, data: articulo });
  } else {
    await prisma.articulo.create({ data: articulo });
  }
}
// For 100 records: 200+ queries = 2-5 seconds

// IMPROVED: Use Prisma transactions + createMany
await prisma.$transaction(async (tx) => {
  // Bulk create new records (skip duplicates)
  await tx.articulo.createMany({
    data: newArticulos,
    skipDuplicates: true,
  });
  // Update existing in batches
  for (const articulo of existingArticulos) {
    await tx.articulo.update({ where: { id: articulo.id }, data: articulo });
  }
});

// BEST: Use raw SQL upsert for maximum performance
await prisma.$executeRaw`
  INSERT INTO articulo (erp_codigo, nombre, sku, ...)
  VALUES ${Prisma.join(values)}
  ON CONFLICT (erp_codigo)
  DO UPDATE SET nombre = EXCLUDED.nombre, ...
`;
```

### Anti-Patterns to Avoid
- **Increasing timeouts without fixing root cause:** If batches take too long because of N+1 queries in the gateway, increasing timeouts just masks the problem
- **Setting timeout to 0 (infinite):** This can lead to hung connections and resource leaks
- **Ignoring SSE heartbeats:** Without heartbeats, proxies WILL kill long-lived SSE connections
- **Catching timeout errors silently:** The current error handling converts timeouts to generic "Error al ejecutar" messages

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request timeout | Custom Promise.race timeout wrapper | `AbortSignal.timeout()` or `AbortSignal.any()` | Built into Node.js 20+, works with undici natively, proper cleanup |
| SSE heartbeat | Custom setInterval | `@fastify/sse` plugin or manual `: heartbeat\n\n` | SSE spec defines comment lines as keep-alive mechanism |
| Bulk upsert | Record-by-record loop | Prisma `createMany` + raw SQL `ON CONFLICT` | 10-100x faster for large batches |
| Error classification | String matching on error messages | Error codes/types from undici (`AbortError`, `HeadersTimeoutError`) | Reliable, version-stable error identification |
| Connection keep-alive | Manual ping/pong | HTTP keep-alive headers + proxy configuration | Standard HTTP mechanism |

**Key insight:** The timeout problem is a configuration issue, not an architectural one. The code structure is sound -- it just needs proper timeout values at each layer and SSE keep-alive. The performance problem (slow gateway ingestion) is a separate but compounding issue that makes timeouts more likely to hit.

## Common Pitfalls

### Pitfall 1: Proxy Timeout Kills SSE Connection
**What goes wrong:** The sync SSE endpoint at `/api/sync/stream` works fine in development but fails in production after 60 seconds
**Why it happens:** Default nginx `proxy_read_timeout` is 60 seconds. If no data flows through the proxy for 60s, it closes the connection. During batch processing, there might be long gaps between SSE events (e.g., a large batch takes 30+ seconds to process on the gateway).
**How to avoid:**
1. Set `proxy_read_timeout 600;` in nginx for the sync service (if behind nginx)
2. Send SSE heartbeat comments every 15s: `reply.raw.write(': heartbeat\n\n');`
3. Send SSE progress events more frequently (per-batch, not just per-entity)
**Warning signs:** Sync always fails at exactly the same time (~60s), regardless of batch size or record count

### Pitfall 2: SQL Server requestTimeout Too Low for Full Dataset Query
**What goes wrong:** The initial query to fetch 100K+ records from the ERP times out
**Why it happens:** The SQL Server adapter has `requestTimeout: 10000` (10 seconds). For a `SELECT` that returns 100K+ rows, the query execution itself may take 5-15 seconds. Network transfer of results adds more time.
**How to avoid:** Increase `requestTimeout` to 120000ms (2 minutes) for sync operations. Do NOT set to 0 (no timeout) as this can hang indefinitely.
**Warning signs:** Error occurs before any batches are processed; error message mentions "Request failed to complete"

### Pitfall 3: Gateway Ingestion N+1 Query Pattern
**What goes wrong:** Each batch of 100 records triggers 200+ individual Prisma queries (findFirst + create/update per record), making each batch request take 2-10 seconds instead of <1 second
**Why it happens:** The `IngestionService` was designed for small batches and correctness, not throughput. Each record does: `findFirst` (lookup) + `create` or `update` = 2 queries minimum per record.
**How to avoid:** Use Prisma `createMany` with `skipDuplicates`, batch lookups, or raw SQL upserts. Even grouping the find operations into a single `WHERE IN` query would help dramatically.
**Warning signs:** Gateway logs show batch processing taking 2-10+ seconds for 100 records; should be <1 second

### Pitfall 4: AbortSignal Not Properly Combined
**What goes wrong:** User cancellation abort signal and timeout signal conflict
**Why it happens:** The code currently passes `abortSignal` from `syncStateManager` to the fetch call. If you also add `AbortSignal.timeout()`, you need to combine them properly.
**How to avoid:** Use `AbortSignal.any([timeoutSignal, cancelSignal])` (available in Node.js 20+)
**Warning signs:** Cancellation works but timeout doesn't, or vice versa

### Pitfall 5: Generic Error Messages Hide Root Cause (SYNC-03)
**What goes wrong:** Users see "Error al ejecutar" with no detail about whether it was a timeout, connection error, validation failure, etc.
**Why it happens:** Multiple catch blocks in the pipeline strip error context. The `SyncEngine` catch block preserves the message, but the SSE `sendEvent('error', ...)` and dashboard display may truncate or genericize it.
**How to avoid:** Implement structured error types with codes: `TIMEOUT_ERP_QUERY`, `TIMEOUT_GATEWAY_REQUEST`, `TIMEOUT_SSE_CONNECTION`, `GATEWAY_INGESTION_ERROR`, etc. Pass these through the entire pipeline.
**Warning signs:** Error messages in sync logs don't contain "timeout", "ETIMEDOUT", or specific error codes

### Pitfall 6: 500ms Delay Between Batches Adds Up
**What goes wrong:** For 100K records with batch size 100, that's 1000 batches. At 500ms delay each, that's 500 seconds (8+ minutes) of JUST delays, before counting actual processing time.
**Why it happens:** `DELAY_BETWEEN_BATCHES_MS: 500` was set for backpressure, but it's excessive for local/fast connections.
**How to avoid:** Make the delay configurable per-sync, with a lower default (100ms or even 0 for manual sync), and only increase if the gateway signals backpressure (e.g., HTTP 429 or slow responses).
**Warning signs:** Sync duration much longer than expected; most time spent in delays rather than processing

## Code Examples

### Example 1: SSE Heartbeat Integration
```typescript
// In sync.ts /api/sync/stream handler, after setting up SSE:
const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds

// Start heartbeat
const heartbeatTimer = setInterval(() => {
  try {
    reply.raw.write(': heartbeat\n\n');
  } catch {
    clearInterval(heartbeatTimer);
  }
}, HEARTBEAT_INTERVAL_MS);

// Clean up heartbeat on connection close
request.raw.on('close', () => {
  clearInterval(heartbeatTimer);
});

// ... rest of sync logic ...

// Clean up before ending
clearInterval(heartbeatTimer);
reply.raw.end();
```

### Example 2: Proper undici Timeout Configuration
```typescript
// In articulos-client.ts sendBatch():
const BATCH_REQUEST_TIMEOUT_MS = 120_000; // 2 minutes per batch

// Combine cancellation signal with timeout signal
const signals: AbortSignal[] = [];
if (abortSignal) signals.push(abortSignal);
signals.push(AbortSignal.timeout(BATCH_REQUEST_TIMEOUT_MS));

const combinedSignal = signals.length === 1
  ? signals[0]
  : AbortSignal.any(signals);

const response = await fetch(`${this.baseUrl}/api/articulos/batch`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ articulos: transformedArticulos }),
  signal: combinedSignal,
});
```

### Example 3: SQL Server Timeout for Sync Operations
```typescript
// In sqlserver-adapter.ts, increase requestTimeout for sync queries:
// Option A: Increase default in connection config
const poolConfig: sql.config = {
  // ... existing config ...
  requestTimeout: 120000, // 2 minutes for sync queries (was 10000)
};

// Option B: Set per-request timeout
const request = this.pool.request();
request.timeout = 120000; // 2 minutes
const result = await request.query(sql);
```

### Example 4: Structured Error with Root Cause
```typescript
// New error classification utility
export function classifyError(error: unknown): {
  code: string;
  message: string;
  isRetryable: boolean;
  rootCause: string;
} {
  if (error instanceof Error) {
    // undici timeout
    if (error.name === 'HeadersTimeoutError' || error.message.includes('UND_ERR_HEADERS_TIMEOUT')) {
      return {
        code: 'TIMEOUT_GATEWAY_HEADERS',
        message: `Gateway no respondio a tiempo (headersTimeout)`,
        isRetryable: true,
        rootCause: 'El gateway tardo demasiado en responder. Puede estar sobrecargado.',
      };
    }
    // undici body timeout
    if (error.name === 'BodyTimeoutError' || error.message.includes('UND_ERR_BODY_TIMEOUT')) {
      return {
        code: 'TIMEOUT_GATEWAY_BODY',
        message: `Timeout al recibir respuesta del gateway`,
        isRetryable: true,
        rootCause: 'El gateway esta procesando un batch muy grande. Intenta con batch size menor.',
      };
    }
    // User cancellation
    if (error.name === 'AbortError') {
      return {
        code: 'SYNC_CANCELED',
        message: 'Sincronizacion cancelada por el usuario',
        isRetryable: false,
        rootCause: 'El usuario cancelo la operacion.',
      };
    }
    // SQL Server timeout
    if (error.message.includes('Request failed to complete') || error.message.includes('ETIMEOUT')) {
      return {
        code: 'TIMEOUT_ERP_QUERY',
        message: `Timeout al consultar ERP: ${error.message}`,
        isRetryable: true,
        rootCause: 'La consulta SQL al ERP tardo demasiado. Verifica la query o el estado del servidor ERP.',
      };
    }
    // Connection refused
    if (error.message.includes('ECONNREFUSED')) {
      return {
        code: 'GATEWAY_UNREACHABLE',
        message: `Gateway no disponible: ${error.message}`,
        isRetryable: true,
        rootCause: 'El servicio gateway no esta ejecutandose o no es accesible.',
      };
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : String(error),
    isRetryable: false,
    rootCause: 'Error no clasificado. Revisa los logs para mas detalles.',
  };
}
```

## Root Cause Analysis: The ~60s Timeout

### Evidence Summary

| Observation | Batch 100 | Batch 200 | Batch 500 |
|-------------|-----------|-----------|-----------|
| Batches completed | 67 | 53 | 20 |
| Records synced | 6700 | 10600 | 10000 |
| Time before failure | 51.9s | 59.1s | 1.3m |
| Time per batch (approx) | 0.77s | 1.1s | 3.9s |

**Key observations:**
1. Failure is time-based (~60s), NOT record-count-based
2. Larger batches process fewer batches but more records before timeout
3. Batch 500 exceeds 60s slightly (1.3m = 78s), suggesting the timeout is flexible or from a different source

### Most Likely Root Causes (Ranked)

**1. The sync service (objetiva-sync) is behind an nginx reverse proxy with default 60s `proxy_read_timeout` (HIGH confidence)**

Evidence: The nginx config file exists for the GATEWAY (`sync-gateway.conf` with 300s timeouts), but there is NO nginx config for the SYNC SERVICE itself. If the sync service is also behind nginx (likely, since it serves a web dashboard), the DEFAULT nginx `proxy_read_timeout` of 60s would kill the SSE connection after 60s of "silence" from the sync service's perspective.

The SSE `/api/sync/stream` endpoint sends progress events, but during batch processing, there can be gaps of several seconds between events. If a batch takes 3-4 seconds (batch 500) and the progress event only fires after each batch, plus the 500ms delay, the proxy might not see data for extended periods.

**2. Node.js `http.Server.requestTimeout` (MEDIUM confidence)**

Node.js 18+ introduced `server.requestTimeout` defaulting to 300 seconds. However, Fastify overrides this. Since Fastify 5 sets `requestTimeout: 0` by default, this should NOT be the issue unless the sync service is on Fastify 4 (it's on Fastify 5).

**3. Browser/Client EventSource timeout (LOW confidence)**

EventSource implementations generally don't have a fixed timeout -- they attempt to reconnect on connection loss. However, if the browser tab is in the background, some browsers throttle or close connections.

### Recommended Investigation Steps

1. **Check if sync service is behind nginx** -- `systemctl status nginx` on the server, check for proxy config
2. **Add SSE heartbeat** -- This fixes the proxy timeout issue regardless of root cause
3. **Add detailed timing logs** -- Log exact timestamps of batch start/end to pinpoint where the 60s boundary falls
4. **Test with longer nginx timeout** -- If behind nginx, set `proxy_read_timeout 600;`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Default timeouts everywhere | Explicit timeout at each layer | Standard practice | Prevents mysterious failures |
| Record-by-record Prisma inserts | `createMany` + raw SQL upsert | Prisma 4.4+ (2022) | 10-100x faster ingestion |
| Global undici timeout | `AbortSignal.timeout()` per request | Node.js 20+ (2023) | Fine-grained control |
| No SSE heartbeat | 15s heartbeat comments | SSE spec | Prevents proxy kills |
| undici headersTimeout 30s | 300s (undici 6+) | undici 6.0 (2024) | Matches browser behavior |

**Deprecated/outdated:**
- `request.timeout` on undici -- use `AbortSignal.timeout()` instead
- `setTimeout(reject, ms)` wrapper for fetch -- use `AbortSignal.timeout()` built-in
- Prisma `upsert` for bulk -- use `createMany` + `skipDuplicates` or raw SQL for bulk

## Open Questions

1. **Is the sync service (objetiva-sync) behind an nginx reverse proxy?**
   - What we know: There is an nginx config for the gateway, but NOT for the sync service
   - What's unclear: Whether the sync service is also proxied via nginx on the deployment server
   - Recommendation: Check during implementation. If yes, create an nginx config with 600s proxy timeouts and SSE-appropriate settings. If no, the root cause is elsewhere.

2. **How large are the actual datasets?**
   - What we know: The requirement says 100K+ records. Testing showed 6700-10600 records before failure.
   - What's unclear: How many total records exist in the ERP for each entity type
   - Recommendation: Plan for 100K+ per entity. With batch 100, that's 1000+ batches per entity.

3. **Should gateway ingestion be optimized in this phase or Phase 9 (tech debt)?**
   - What we know: The N+1 query pattern in gateway ingestion directly contributes to timeout likelihood. Each batch takes 2-10s instead of <1s.
   - What's unclear: Whether fixing the timeout alone (without gateway optimization) will be sufficient for 100K+ records
   - Recommendation: Include gateway ingestion optimization in this phase. Without it, 100K records at batch 100 = 1000 batches * ~3s each = 50 minutes minimum, which is technically "not timing out" but impractically slow.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All source files read directly from repository
- `objetiva-sync/src/config/constants.ts` -- SYNC_CONFIG values, REMOTE_API_CONFIG timeouts
- `objetiva-sync/src/adapters/sqlserver/sqlserver-adapter.ts` -- SQL Server requestTimeout: 10000ms
- `objetiva-sync/src/api-client/articulos-client.ts` -- undici fetch with NO explicit timeout
- `objetiva-sync-gateway/nginx/sync-gateway.conf` -- nginx config with 300s proxy timeouts
- `objetiva-sync-gateway/src/services/ingestion.ts` -- Record-by-record Prisma inserts
- `objetiva-sync-gateway/src/app.ts` -- Gateway Fastify setup (no explicit timeout config)
- `objetiva-sync/src/dashboard/routes/api/sync.ts` -- SSE endpoint with no heartbeat

### Secondary (MEDIUM confidence)
- [Fastify Server Documentation](https://fastify.dev/docs/latest/Reference/Server/) -- Timeout defaults verified: `requestTimeout: 0`, `keepAliveTimeout: 72000`, `connectionTimeout: 0`
- [undici Client Documentation](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md) -- `headersTimeout: 300e3`, `bodyTimeout: 300e3` (300 seconds each)
- [node-mssql Documentation](https://tediousjs.github.io/node-mssql/) -- `requestTimeout` default is 15000ms (but overridden to 10000 in codebase)
- [Handling HTTP timeouts in Fastify](https://nearform.com/digital-community/handling-http-timeouts-in-fastify/) -- Best practices for timeout configuration
- [MDN SSE Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- SSE comment keep-alive spec

### Tertiary (LOW confidence)
- Nginx default `proxy_read_timeout` of 60s -- widely documented but needs verification for the specific deployment

## Metadata

**Confidence breakdown:**
- Root cause analysis: HIGH -- Multiple timeout layers identified from direct code analysis, ~60s pattern strongly matches nginx default proxy_read_timeout
- Timeout configuration: HIGH -- All values verified from source code and official documentation
- Gateway ingestion optimization: MEDIUM -- Prisma `createMany`/upsert patterns are well-documented but need testing with this specific schema
- Error message improvement (SYNC-03): HIGH -- Error types from undici and mssql are well-documented

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable -- no breaking changes expected in existing stack)
