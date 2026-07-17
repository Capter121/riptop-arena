# Phase 3B Stage 7 Playwright Collection-Boundary Diagnosis

Status: `REPAIR_AUTHORIZED`

## Direct cause

The Stage 7 spec imported `src/domain.ts` in the Playwright Node collection process to calculate an expected combination ID. `domain.ts` imports `src/generated/parts.catalog.json` as a browser application module. The current Node ESM collector requires a JSON import attribute, so collection failed before any browser or product test ran.

This was a test collection-boundary error. It was not a product PASS or FAIL.

## Existing authoritative product outputs

The application already exposes the required verification data without a Node-side product-module import:

1. The page DOM renders the current ID in `[data-testid="combination-id"]`.
2. The existing public diagnostic snapshot, `window.__NSS_CUSTOMIZER__.snapshot()`, contains both the five-part `combination` record and its product-generated `combinationId`.
3. The share panel renders a product-generated `?combo=<id>` URL.
4. Combination JSON export contains the current five part IDs.
5. Local favorites store a combination ID with the five-part record.
6. The version-controlled Phase 2C matrix is available as a fallback source.

## Selected authority

The repaired test uses the existing browser outputs in items 1 and 2:

- Before selection, it reads the current five-part record from the public diagnostic snapshot.
- It creates the expected record by replacing only the selected family with the clicked part ID. This is state expectation construction, not a combination-ID calculation.
- After the readout observation, click, and ready condition complete, it requires the product snapshot's five-part record to equal that expected record.
- It requires the visible DOM combination ID to equal the product-generated snapshot `combinationId`.
- It still verifies the exact readout text, selected option, and task progress.

The test does not import `src/domain.ts`, dynamically import browser modules, read or modify internal state, or reproduce the combination-ID ranking formula. The product remains the sole authority that calculates the ID.

## Collection boundary

A static boundary test scans Stage 7 spec and helper imports and rejects direct or transitive relative imports of `src/domain.ts`, `src/store.ts`, `src/App.tsx`, or `src/Scene.tsx`. The executable collection gate remains `playwright test --list`, which collects tests without starting the browser workflow or accessing the product page.
