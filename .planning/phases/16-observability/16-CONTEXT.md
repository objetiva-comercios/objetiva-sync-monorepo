# Phase 16: Observability - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-ready observability for monitoring system health, debugging issues with correlation IDs, and collecting Prometheus metrics. Covers both sync module and gateway. This phase implements requirements OB-01 through OB-06.

</domain>

<decisions>
## Implementation Decisions

### Metrics scope
- Labels include both entity name AND origin source for multi-origin visibility
- Gateway exposes its own metrics (HTTP request duration, Prisma query duration) alongside sync metrics
- Full stack visibility: sync operations + gateway HTTP + database queries

### Log format
- JSON lines (ndjson) format for all logs — parseable by ELK, Loki, and standard log aggregation tools
- Every log entry is one JSON object per line

### Claude's Discretion
- Core sync metrics selection (duration histograms, record counters)
- Histogram bucket ranges for duration metrics
- Automatic log context fields (correlationId, entityName, sourceId, batchId as appropriate)
- Default log level configuration
- Correlation ID generation vs requiring from client

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for Fastify/Pino observability.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-observability*
*Context gathered: 2026-02-12*
