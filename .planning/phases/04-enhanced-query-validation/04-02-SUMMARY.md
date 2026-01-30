---
phase: 04-enhanced-query-validation
plan: 02
subsystem: validation
tags: [fastest-levenshtein, schema-validation, query-validation, field-suggestions, levenshtein-distance, typescript]

# Dependency graph
requires:
  - phase: 04-01
    provides: Schema cache infrastructure for fetching PostgreSQL schemas from gateway
provides:
  - Schema-driven query validator with field suggestions (validateQueryAgainstSchema)
  - Live schema validation in dashboard save endpoint
  - Combined Zod + schema validation in test-and-validate endpoint
  - "Did you mean?" typo detection using Levenshtein distance
  - Graceful degradation when gateway/schema unavailable
affects: [04-03, dashboard-ui, query-configuration]

# Tech tracking
tech-stack:
  added: [fastest-levenshtein]
  patterns: [live-schema-validation, field-suggestion-heuristics, graceful-degradation]

key-files:
  created:
    - objetiva-sync/src/sync/schema-validator.ts
  modified:
    - objetiva-sync/src/dashboard/routes/api/queries.ts
    - objetiva-sync/package.json

key-decisions:
  - "Empty rows return isValid: true with warning (not error) - filtered queries may legitimately return 0 rows"
  - "Schema unavailable returns isValid: true with warning - graceful degradation when gateway is down"
  - "Levenshtein distance ≤ 3 for suggestions - catches typos without suggesting unrelated words"
  - "Field length ratio 0.5-2.0 for suggestions - avoids suggesting very short/long words"
  - "SQL Server TOP 10 syntax for test queries - known limitation, other databases need LIMIT"
  - "Lenient type compatibility - string compatible with number (could be stringified)"
  - "Skip validation if no active connection - don't block saves when ERP is unreachable"

patterns-established:
  - "Validation Result pattern: isValid + errors[] + warnings[] + schemaUnavailable flag"
  - "Field suggestion heuristic: closest match via Levenshtein with distance/length ratio filters"
  - "Type normalization: PostgreSQL types → JavaScript runtime types for compatibility checking"

# Metrics
duration: 19min
completed: 2026-01-30
---

# Phase 4 Plan 2: Schema Validation with Field Suggestions Summary

**Live PostgreSQL schema validation with "Did you mean?" field suggestions using Levenshtein distance, blocking invalid queries in dashboard save flow**

## Performance

- **Duration:** 19 min
- **Started:** 2026-01-30T11:59:15Z
- **Completed:** 2026-01-30T12:18:02Z
- **Tasks:** 3
- **Files modified:** 2 created, 1 modified

## Accomplishments

- Schema validator detects missing required fields, unexpected fields, and type mismatches
- Field suggestions via Levenshtein distance (≤3 edit distance) catch typos and similar field names
- Dashboard save endpoint validates queries before saving, returns 400 with detailed errors if invalid
- Test-and-validate endpoint combines Zod and schema validation for comprehensive feedback
- Empty query results treated as warning (not error) - filtered queries may legitimately return 0 rows
- Graceful degradation when gateway/schema unavailable - validation skipped, saves proceed with warning

## Task Commits

Each task was committed atomically:

1. **Task 1: Install fastest-levenshtein and create schema validator** - `85de502` (feat)
   - Installed fastest-levenshtein package
   - Created schema-validator.ts with live schema validation
   - Implemented field suggestion algorithm with Levenshtein distance
   - Handle empty rows as warning (isValid: true)
   - Graceful degradation when schema unavailable

2. **Task 2: Integrate validation into dashboard save endpoint** - `dd658ec` (feat)
   - Execute test query (TOP 10) before saving
   - Validate against live PostgreSQL schema
   - Block saves with 400 + validationErrors if invalid
   - Allow saves when schema unavailable or rows empty (with warnings)
   - Skip validation if no active connection

3. **Task 3: Add validation to test-and-validate endpoint** - `a44487e` (feat)
   - Add schemaValidation alongside existing Zod validation
   - Combine isValid results (zodValidation.isValid && schemaValidation.isValid)
   - Return schemaValidation object with errors, warnings, schemaUnavailable
   - Maintain backward compatibility with existing response structure

## Files Created/Modified

- `objetiva-sync/src/sync/schema-validator.ts` - Schema-driven validator with field suggestions
  - Exports: validateQueryAgainstSchema, ValidationError, ValidationResult
  - Functions: getRequiredFields, normalizePostgresType, detectJsType, isTypeCompatible, findSuggestion
  - Uses fastest-levenshtein for typo detection
  - Validates: missing required fields, unexpected fields, type mismatches

- `objetiva-sync/src/dashboard/routes/api/queries.ts` - Dashboard query API endpoints
  - Modified /api/queries/save: Added pre-save schema validation
  - Modified /api/queries/test-and-validate: Added schema validation alongside Zod validation
  - Returns validationErrors array with field-level detail when invalid

- `objetiva-sync/package.json` - Added fastest-levenshtein dependency

## Decisions Made

**Empty rows as warning (not error):**
Filtered queries (e.g., `WHERE fecha > '2025-01-01'`) may legitimately return 0 rows. Treating this as an error would block saving valid queries. Solution: Return `{ isValid: true, warnings: ['Query returned no rows...'] }` instead of error.

**Schema unavailable as warning (not error):**
Gateway may be temporarily unreachable during query configuration. Blocking saves would prevent users from working. Solution: Return `{ isValid: true, schemaUnavailable: true, warnings: ['Schema unavailable...'] }` and proceed with save.

**Levenshtein distance ≤ 3:**
Higher distances suggest unrelated words, not typos. Testing showed distance ≤ 3 catches common typos (transposition, missing letter, extra letter) without false positives.

**Field length ratio 0.5-2.0:**
Prevents suggesting "id" for "articulo_descripcion_larga" (very different lengths). Ratio ensures suggested field is similar in length to typo.

**SQL Server TOP syntax:**
Plan specifies SQL Server as primary database. Other databases (PostgreSQL, MySQL) would need `LIMIT` clause instead. Documented as known limitation in comments.

**Lenient type compatibility:**
SQL queries may return stringified numbers (e.g., "123" instead of 123). Strict type checking would cause false positives. Solution: Allow string→number compatibility.

**Skip validation when no active connection:**
Dashboard allows query configuration even when ERP database is offline. Validation should not block this workflow. Logged as warning, save proceeds.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified in plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 04-03 (Dashboard UI Enhancement):**
- Schema validation backend complete
- Validation errors include field-level detail with suggestions
- API returns structured validationErrors array for UI rendering
- schemaValidation object available in test-and-validate response

**API Response Structure for UI:**
```typescript
// /api/queries/save (when invalid)
{
  success: false,
  error: 'Query validation failed against schema',
  validationErrors: [
    {
      field: 'customer_id',
      type: 'MISSING_REQUIRED',
      message: 'Required field customer_id is missing',
      suggestion: 'Did you mean custmer_id?' // if typo detected
    }
  ]
}

// /api/queries/test-and-validate
{
  success: true,
  validation: {
    isValid: zodValidation.isValid && schemaValidation.isValid,
    schemaValidation: {
      isValid: boolean,
      errors: ValidationError[],
      warnings: string[],
      schemaUnavailable: boolean
    }
  }
}
```

**No blockers or concerns.**

---
*Phase: 04-enhanced-query-validation*
*Completed: 2026-01-30*
