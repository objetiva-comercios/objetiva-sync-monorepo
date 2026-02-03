# Phase 08 Plan 02: Explicit Timeouts and Error Classification Summary

**One-liner:** Added 2-minute explicit fetch timeouts via AbortSignal.timeout() and comprehensive error classification with Spanish root cause messages to all gateway API clients.

---
phase: 08
plan: 02
subsystem: sync-reliability
tags: [timeout, error-handling, observability, undici, abort-signal]
date: 2026-02-03
status: complete
---

## Requires

- v1.0 sync pipeline (api-client, gateway communication)
- undici fetch with AbortSignal support

## Provides

- `objetiva-sync/src/utils/error-classifier.ts` - 11-type error classification utility
- All 4 API clients with explicit 2-minute timeouts
- All 4 API clients with classified error responses (code, message, root cause)
- comprobantes-pagos-client with consistent sendBatch signature

## Affects

- Future error monitoring: Error codes enable filtering/alerting by type
- Future retry logic: isRetryable flag supports smart retry decisions
- User experience: Spanish error messages with root cause explanations
- Debugging: Structured error logging with classification metadata

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 2-minute timeout (120,000ms) | Balances large batch processing with preventing indefinite hangs | Users see timeout after 2min instead of hanging indefinitely |
| AbortSignal.any() for combining signals | Standard API for merging timeout + cancellation signals | Clean implementation, browser/Node compatible |
| Classify errors in catch block | Single source of truth for error categorization | Consistent error handling across all clients |
| Spanish root cause messages | User-facing errors should be in application language | Better UX for Spanish-speaking users |
| Error message format: "{message} &#124; Causa: {rootCause}" | Clear separation of symptom and root cause | Users see both what failed and why |

## Tech Stack

### Added

- Error classification patterns: HeadersTimeoutError, BodyTimeoutError, ECONNREFUSED, ECONNRESET, SQL timeout detection

### Patterns

- Layered timeout strategy: AbortSignal.timeout (explicit) + undici config (implicit fallback)
- Structured error responses: { code, message, isRetryable, rootCause }
- Error type detection via name, message patterns, and regex matching

## Key Files

### Created

- `objetiva-sync/src/utils/error-classifier.ts` (130 lines)
  - classifyError(error: unknown): ClassifiedError
  - 11 error type classifications
  - Spanish error messages with root cause descriptions

### Modified

- `objetiva-sync/src/api-client/articulos-client.ts`
  - Added BATCH_REQUEST_TIMEOUT_MS constant
  - Fetch with AbortSignal.any([abortSignal, timeoutSignal])
  - Catch block uses classifyError()

- `objetiva-sync/src/api-client/comprobantes-cabecera-client.ts`
  - Same timeout and classification changes

- `objetiva-sync/src/api-client/comprobantes-detalle-client.ts`
  - Same timeout and classification changes

- `objetiva-sync/src/api-client/comprobantes-pagos-client.ts`
  - Added metadata and abortSignal parameters to sendBatch()
  - Same timeout and classification changes

## Implementation Notes

**Error Classification Order:**
The classifier checks errors in priority order:
1. User cancellation (AbortError without "timeout" in message)
2. Explicit timeout (TimeoutError or AbortError with "timeout")
3. undici timeouts (HeadersTimeoutError, BodyTimeoutError)
4. SQL Server timeouts (ETIMEOUT, requestTimeout)
5. Network errors (ECONNREFUSED, ECONNRESET, DNS)
6. HTTP errors (401/403, 5xx)
7. Unknown errors (catch-all)

**Timeout Signal Combination:**
```typescript
const timeoutSignal = AbortSignal.timeout(120_000);
const combinedSignal = abortSignal
  ? AbortSignal.any([abortSignal, timeoutSignal])
  : timeoutSignal;
```
This ensures both user cancellation AND timeout work together - whichever triggers first aborts the request.

**comprobantes-pagos-client Signature Fix:**
The pagos client was missing the metadata and abortSignal parameters that the other 3 clients had. This was corrected to maintain API consistency across all clients.

## Verification Performed

1. Verified classifyError function handles 11 error types ✓
2. Confirmed all 4 API clients use AbortSignal.timeout(120_000) ✓
3. Confirmed all 4 API clients combine timeout with cancellation via AbortSignal.any() ✓
4. Confirmed all 4 API clients use classifyError() in catch blocks ✓
5. Confirmed comprobantes-pagos-client has abortSignal parameter ✓
6. TypeScript compilation check: No new errors in error-classifier.ts ✓

## Deviations from Plan

None - plan executed exactly as written.

## Performance Impact

- **Positive:** Prevents indefinite hangs on slow/unresponsive gateway
- **Positive:** 2-minute timeout allows large batches to complete normally
- **Neutral:** AbortSignal.any() has negligible overhead
- **Neutral:** classifyError() adds ~1ms per error (only on failure path)

## Next Phase Readiness

**Ready for Phase 08-03** (if exists - verify roadmap)

**Blocker check:**
- None - timeout and error classification are independent features

**Integration points:**
- Error classification codes can be used for retry logic filtering
- isRetryable flag can drive automatic retry decisions
- rootCause can be displayed in dashboard error UI

## Session Metadata

**Commits:**
- `8d474f5` feat(08-02): add error classification utility
- `688c88a` feat(08-02): add 2-minute timeout and error classification to all API clients

**Execution time:** 517 seconds (~8.6 minutes)

**Files changed:** 5 files
- 1 created (error-classifier.ts)
- 4 modified (all API clients)
