---
phase: 15-auth-simplification
plan: 01
subsystem: auth
tags: [jwt, fastify, token-refresh, error-codes]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: JWT authentication setup with @fastify/jwt
provides:
  - POST /auth/refresh endpoint for token renewal
  - expiresIn field in login/refresh responses
  - Specific auth error codes (TOKEN_EXPIRED, TOKEN_INVALID, TOKEN_MISSING, SIGNATURE_MISMATCH)
  - AUTH_ERROR_CODES constant export for client use
affects: [15-02, 15-03, 15-04, objetiva-sync-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duration string parsing (1h, 24h, 30m) to seconds"
    - "Error code mapping for @fastify/jwt errors"

key-files:
  created: []
  modified:
    - objetiva-sync-gateway/src/routes/auth.ts
    - objetiva-sync-gateway/src/middleware/auth.ts

key-decisions:
  - "Parse JWT_EXPIRES_IN to seconds for client-facing expiresIn field"
  - "Check Authorization header before jwtVerify for early TOKEN_MISSING detection"
  - "Map FST_JWT_* error codes to descriptive TOKEN_* error codes"

patterns-established:
  - "Auth error response format: {success: false, error: CODE, message: DESCRIPTION}"
  - "Token refresh returns same fields as login for consistency"

# Metrics
duration: 8min
completed: 2026-02-12
---

# Phase 15 Plan 01: Token Refresh and Error Codes Summary

**Token refresh endpoint with expiresIn response and specific auth error codes for troubleshooting**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-12T15:07:48Z
- **Completed:** 2026-02-12T15:15:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- POST /auth/refresh endpoint for long-running syncs that need token renewal
- Login and refresh responses include expiresIn (seconds) and tokenType fields
- Specific error codes replace generic "Token invalido o expirado" message
- Error codes are logged for debugging without exposing token contents

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Token Refresh Endpoint** - `8f9f0e1` (feat)
2. **Task 2: Add Specific Auth Error Codes** - `2449243` (feat)

## Files Created/Modified

- `objetiva-sync-gateway/src/routes/auth.ts` - Added /auth/refresh endpoint, parseDurationToSeconds helper, expiresIn in login response
- `objetiva-sync-gateway/src/middleware/auth.ts` - Added AUTH_ERROR_CODES constant, specific error mapping for @fastify/jwt errors

## Decisions Made

- **Duration parsing:** Created parseDurationToSeconds() to convert JWT_EXPIRES_IN strings (1h, 24h, 30m) to numeric seconds for API responses
- **Early header check:** Check for missing Authorization header before calling jwtVerify() to return TOKEN_MISSING immediately
- **Error code mapping:** Map @fastify/jwt internal codes (FST_JWT_*) to user-friendly codes (TOKEN_EXPIRED, TOKEN_INVALID, etc.)
- **Signature mismatch:** Added SIGNATURE_MISMATCH error code for JWT_SECRET configuration issues between services

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compiled successfully, all unit tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Token refresh endpoint ready for client integration
- Error codes can be used by objetiva-sync client for automatic retry logic
- Ready for Phase 15-02 (Client Token Management)

---
*Phase: 15-auth-simplification*
*Completed: 2026-02-12*
