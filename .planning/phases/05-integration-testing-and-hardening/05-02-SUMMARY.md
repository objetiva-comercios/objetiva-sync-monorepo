---
phase: 05-integration-testing-and-hardening
plan: 02
type: summary
subsystem: sync-validation
tags: [testing, schema-validation, error-reporting, prisma, zod]
completed: 2026-01-31
duration: 18m

requires:
  - 04-02 # Schema validator and suggestions
  - 03-02 # CLI regenerate-schemas command

provides:
  - Schema testing utilities (Prisma/Zod parsers)
  - Schema validation integration tests (10 tests)
  - Validation error reporting tests
  - Full schema propagation test (ALTER TABLE -> CLI -> validation)

affects:
  - 05-04 # Dashboard validation display
  - 05-05 # End-to-end schema change workflow

tech-stack:
  added: []
  patterns:
    - Brace-counting parsers for nested structures
    - Module mocking for isolated integration tests
    - Graceful test skipping with describe.skip
    - Vitest mocking patterns

key-files:
  created:
    - objetiva-sync/tests/helpers/schema-test-utils.ts
    - objetiva-sync/tests/integration/schema-validation.integration.test.ts
    - objetiva-sync/tests/integration/validation-errors.integration.test.ts
  modified: []

decisions:
  - name: Brace-counting parsers for schema files
    rationale: |
      Regex-based parsing failed on nested braces in Prisma arrays (String[])
      and Zod method chains (.optional()). Implemented character-by-character
      brace counting to properly extract full model/object definitions.
    alternatives:
      - AST parsing: Too complex for simple field extraction
      - Improved regex: Cannot handle arbitrary nesting depth
    impact: Reliable schema field extraction for all cases

  - name: Module-level mocking for schemaCache
    rationale: |
      vi.spyOn() didn't work with module exports. Used vi.mock() at top level
      to mock entire schemaCache module, then configure mocks in beforeEach.
    alternatives:
      - Dependency injection: Would require refactoring schema-validator
      - Test-specific exports: Would pollute production code
    impact: Clean, isolated tests without production code changes

  - name: Graceful skip for propagation test
    rationale: |
      Full schema propagation test requires TEST_DATABASE_URL to ALTER TABLE.
      Use describe.skip to allow CI/local testing without database setup.
    alternatives:
      - Mock database: Can't test actual ALTER TABLE roundtrip
      - Require database: Breaks simple test runs
    impact: Tests run anywhere, full coverage available with database

metrics:
  test-coverage:
    files: 3
    tests: 11
    passing: 10
    skipped: 1
    duration: 2.5s
---

# Phase 05 Plan 02: Schema Validation and Propagation Tests Summary

**One-liner:** Test infrastructure for schema validation errors and full ALTER TABLE -> CLI -> Prisma/Zod -> validation propagation

## What Was Built

Created comprehensive test suite for schema validation and error reporting:

**Schema Testing Utilities (schema-test-utils.ts):**
- `getPrismaModelFields(modelName)` - Parse Prisma schema files
- `getZodSchemaFields(schemaPath)` - Parse Zod TypeScript schema files
- `verifySchemaFile(schemaPath, expectedFields)` - Verify field presence
- Brace-counting parsers handle nested structures correctly

**Schema Validation Tests (11 tests total):**

1. **Missing required fields** - Detects when query results lack required columns
2. **Extra fields** - Detects fields not in schema
3. **All fields match** - Validates correct query structure
4. **CLI dry-run** - Verifies regenerate-schemas command works
5. **Prisma/Zod sync** - Confirms schemas stay synchronized
6. **Type mismatches** - Reports incompatible JavaScript types
7. **Typo suggestions** - Levenshtein distance suggestions for similar field names
8. **Dashboard error format** - Validates error structure for UI display
9. **Multiple errors** - Handles and reports multiple validation failures
10. **Full propagation test** - ALTER TABLE → CLI → Prisma/Zod → validation (requires TEST_DATABASE_URL, skipped gracefully)

**Test Coverage:**
- All 10 basic tests pass in < 3 seconds
- 1 propagation test skips when TEST_DATABASE_URL not set
- Mock schemaCache for isolated testing
- No external dependencies required for core tests

## Problems Solved

### Problem 1: Schema Parser Failures

**Issue:** Initial regex parsers failed on nested braces:
- Prisma arrays: `String[] @default([])` - regex stopped at first `]`
- Zod methods: `.optional()` - regex stopped at first `)`

**Solution:** Implemented brace/paren counting:
```typescript
let braceCount = 0;
for (let i = start; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) { /* found end */ }
  }
}
```

**Result:** Correctly extracts all 42 Prisma fields and 33 Zod fields

### Problem 2: Mock Not Working

**Issue:** `vi.spyOn(schemaCache, 'getSchema')` didn't intercept calls

**Root cause:** Module-level singleton pattern in schemaCache

**Solution:** Used `vi.mock()` at top level:
```typescript
vi.mock('../../src/services/schema-cache.js', () => ({
  schemaCache: {
    getSchema: vi.fn(),
    invalidate: vi.fn(),
  },
}));
```

**Result:** Clean mocking in beforeEach without production code changes

### Problem 3: Tests Require Database

**Issue:** Full propagation test needs PostgreSQL to ALTER TABLE

**Solution:** Conditional test execution:
```typescript
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const skipPropagation = !TEST_DATABASE_URL;

(skipPropagation ? describe.skip : describe)('Schema Propagation Test', () => {
  // Test only runs if TEST_DATABASE_URL is set
});
```

**Result:** Tests pass in CI and locally without database, but full coverage available when needed

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

**All tests passing:**
```
Test Files  2 passed (2)
     Tests  10 passed | 1 skipped (11)
  Duration  2.47s
```

**Skipped test:**
- Schema propagation (requires TEST_DATABASE_URL)
- Documented in test output
- Full test available for UAT/production verification

**Test categories:**
- Schema validation: 5 tests
- Validation errors: 5 tests
- Schema propagation: 1 test (skipped)

## How to Test

**Run all schema tests:**
```bash
cd objetiva-sync
npm test -- tests/integration/schema-validation tests/integration/validation-errors
```

**Run with database propagation test:**
```bash
export TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"
npm test -- tests/integration/schema-validation.integration.test.ts
```

**Expected output:**
- 10 tests passing
- 1 test skipped (without TEST_DATABASE_URL) or 11 passing (with database)

## Next Steps

**Immediate:**
- Plan 05-04 can now test dashboard validation error display
- Plan 05-05 can use propagation test for end-to-end validation

**Future UAT:**
- Run propagation test with TEST_DATABASE_URL before production deployment
- Verify full ALTER TABLE -> CLI -> validation roundtrip works

## Files Changed

**Created:**
- `objetiva-sync/tests/helpers/schema-test-utils.ts` (179 lines) - Schema parsing utilities
- `objetiva-sync/tests/integration/schema-validation.integration.test.ts` (348 lines) - Validation tests
- `objetiva-sync/tests/integration/validation-errors.integration.test.ts` (233 lines) - Error reporting tests

**Total:** 3 files, 760 lines

## Commits

1. `59424e5` - test(05-02): add schema testing utilities and validation tests
2. `f9d4131` - test(05-02): add validation error reporting tests

## Wave Status

**Wave 2 - Plan 2 of 3:**
- Plan 05-02: ✅ Complete (this plan)
- Plan 05-04: Next - Dashboard sync testing
- Plan 05-05: After - End-to-end workflow

**Dependencies resolved:**
- Schema validator (04-02) ✅
- CLI regenerate-schemas (03-02) ✅

**Unblocks:**
- Dashboard validation display testing
- Full system integration tests
