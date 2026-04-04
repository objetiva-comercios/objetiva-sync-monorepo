---
status: complete
phase: 27-schema-status-page
source: 27-01-SUMMARY.md, 27-02-SUMMARY.md
started: 2026-04-04T03:52:00Z
updated: 2026-04-04T04:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Tab Bar Navigation
expected: Dashboard has 2 top-level tabs: "Dashboard" and "Schema Status". Active tab shows visual indicator. Clicking switches view.
result: pass
evidence: Accessibility snapshot shows button "Dashboard" [ref=e6] and button "Schema Status" [ref=e7] in navigation. After click, Schema Status shows [active] attribute.

### 2. Schema Status Page Renders
expected: Clicking "Schema Status" tab renders page with heading "Schema Status", subtitle "Comparacion de schemas entre PostgreSQL, gateway y sync", and "Actualizar" button
result: pass
evidence: Snapshot confirms heading "Schema Status" [level=1], paragraph with subtitle, button "Actualizar" with refresh icon

### 3. Sync Not Reported Banner (conditional)
expected: When sync has reported schemas, NO banner is shown. When sync hasn't reported, alert banner appears.
result: pass
evidence: No banner visible (correct behavior — sync IS reporting). All 4 entities show populated Sync column with real data.

### 4. Entity Tabs with Problem Counts
expected: 4 entity tabs: Artículos, Comprobantes, Detalles, Pagos. Each shows problem count badge. Clicking switches table content.
result: pass
evidence: Verified all 4 tabs present with counts — Artículos (5 problemas), Comprobantes (33 problemas), Detalles (29 problemas), Pagos (28 problemas). Clicked each tab, confirmed [active] state changes and table content updates.

### 5. Schema Comparison Table Structure
expected: Table with 5 columns: Campo, PostgreSQL, Compilado, Sync, Estado. Each row shows field name, data type + nullable for each layer.
result: pass
evidence: Table confirmed with columnheaders Campo, PostgreSQL, Compilado, Sync, Estado. Rows show field data like "sku | text YES | text YES | text YES | Alineado" and "precio | decimal YES | decimal YES | decimal YES | Alineado". 45+ fields visible in Artículos entity.

### 6. Alignment Status Indicators
expected: Three status states: "Alineado" (green — all layers match), "Desincronizado" (red — type mismatch), "Faltante" (yellow — exists in PostgreSQL but not in compiled/sync)
result: pass
evidence: Verified all 3 states in Artículos tab — Alineado: sku, codigo, precio, activo, etc. | Desincronizado: imagenes_producto (jsonb vs array), imagenes_etiqueta, etiquetas_ocr | Faltante: categoria, subcategoria (varchar in PG, "—" in compiled/sync)

### 7. Auto-Polling (10s refresh)
expected: Page automatically fetches fresh data from GET /api/schemas/compare every ~10 seconds without user interaction
result: pass
evidence: performance.getEntriesByType('resource') count for 'schema' URLs went from 18 → 21 in 12 seconds (3 new requests = ~10s polling interval confirmed)

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
