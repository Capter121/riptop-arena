# Phase 2C full combination matrix implementation plan

Status: authorized for technical execution under provisional waiver

Current visual-review status: **Phase 2B visual review deferred pending real reviewers**

Baseline: `v0.2.0-rc1-technical-baseline` (`PROVISIONAL_NOT_FINAL`)

> Human visual review remains pending. Technical continuation was authorized by documented provisional exception, not by fabricated review data.

## Scope and invariants

Phase 2C validates `2 × 4 × 3 × 3 × 4 = 288` combinations in memory. It may change only enumeration, assembly validation, collision validation, reports, and tests. It must not generate 288 assembled GLBs, change visible geometry, change materials, change NSS-V1, close the visual-review requirement, or make release, manufacturing, safety, or legal-originality claims.

The implementation uses a deterministic single-thread reference path. Parallel execution is deferred unless measurements prove it necessary; YAGNI applies.

## Stage 0 — Provisional authorization and baseline

### Task 0.1 — Validate the pinned waiver

- Goal: reject missing, expired, malformed, or modified authorization.
- Modified files: none. New files: `scripts/validate_phase2c_waiver.py`, `tests/test_phase2c_waiver.py`.
- Prerequisite: waiver exists at the documented path.
- Implementation: parse exactly one CSV row, validate headers and required values, compare pinned SHA-256, and compare the current date with 2026-08-14.
- Command: `python scripts/validate_phase2c_waiver.py` and `python -m unittest tests/test_phase2c_waiver.py`.
- Expected: `NSS_PHASE2C_WAIVER=PASS`; missing, altered, and expired fixtures fail.
- Stop condition: any waiver error.
- Commit: include with the provisional-status record.
- Recovery: restore the user-authorized waiver exactly; never synthesize a replacement.

### Task 0.2 — Validate and capture 16 frozen parts

- Goal: produce the provisional reproducibility manifest without regenerating geometry.
- Modified files: current validation reports. New files: `scripts/manage_phase2c_provisional_baseline.py`, `scripts/prepare_phase2c_baseline.ps1`, and both baseline documents.
- Prerequisite: Task 0.1 passes and all 16 BLEND/GLB artifacts exist.
- Implementation: run geometry re-import, collider, glTF Validator, raw hash, semantic fingerprint, spec hash, and NSS-V1 hash checks.
- Command: `powershell -ExecutionPolicy Bypass -File scripts/prepare_phase2c_baseline.ps1`.
- Expected: 16 unique parts, 0 Validator errors/warnings, 0 collider failures, and a provisional manifest expiring 2026-08-14.
- Stop condition: missing artifact, non-PASS report, hash failure, extra/missing part, or NSS-V1 mismatch.
- Commit: `chore: freeze v0.2.0-rc1 technical baseline`; annotated tag the commit.
- Recovery: discard only generated validation reports and correct the failing prerequisite; do not modify geometry to force a pass.

## Stage 1 — Deterministic enumeration

### Task 1.1 — Read the five part families

- Goal: derive scope from the 16 existing part specs rather than a hand-written combination list.
- Modified files: none. New files: `scripts/phase2c_matrix.py`.
- Prerequisite: baseline verification passes.
- Implementation: group specs by the five approved `part_type` values and enforce cardinalities 2/4/3/3/4.
- Command: `python scripts/phase2c_matrix.py --enumerate-only`.
- Expected: five complete families and no unknown or duplicate part IDs.
- Stop condition: cardinality, type, interface, or scope mismatch.
- Commit: include with Phase 2C validator infrastructure.
- Recovery: restore the frozen specs; do not add scope exceptions.

### Task 1.2 — Generate stable combination IDs

- Goal: enumerate exactly 288 stable records in Cartesian-product order.
- Modified files: `scripts/phase2c_matrix.py`. New files: `tests/test_phase2c_matrix.py`.
- Prerequisite: Task 1.1 passes.
- Implementation: generate `nss-p2c-0001` through `nss-p2c-0288`, detect duplicates and missing tuples, and sort by ID.
- Command: `python -m unittest tests/test_phase2c_matrix.py`.
- Expected: count 288, duplicates 0, missing 0, stable first/last IDs.
- Stop condition: any enumeration invariant fails.
- Commit: include with Task 1.1.
- Recovery: revert enumeration-only changes; never hand-edit the output list.

## Stage 2 — In-memory assembly

### Task 2.1 — Preload each frozen part once

- Goal: avoid disk export and repeated library imports.
- Modified files: none. New files: `blender/validate_phase2c_matrix.py`.
- Prerequisite: Stage 1 passes and 16 source BLEND files exist.
- Implementation: append each `PART_<id>` collection once and retain its root, mounts, render meshes, and collider.
- Command: `blender.exe --background --python blender/validate_phase2c_matrix.py -- --dry-run-load`.
- Expected: exactly 16 roots and 16 closed collision proxies.
- Stop condition: missing collection, mount, render mesh, or collider.
- Commit: include with matrix validator.
- Recovery: restore the frozen BLEND artifact; do not regenerate a changed part.

### Task 2.2 — Validate interface and mount transforms

- Goal: align all five selected parts and measure every connection.
- Modified files: `blender/validate_phase2c_matrix.py`.
- Prerequisite: Task 2.1 passes.
- Implementation: reset roots, align four mount pairs, validate interface IDs, male/female roles, allowed connections, axis error, datum error, and phase error.
- Command: run one known combination with `--combination-id nss-p2c-0001`.
- Expected: four legal connections within NSS-V1 tolerances.
- Stop condition: interface, role, mount, transform, or tolerance error.
- Commit: include with Task 2.1.
- Recovery: inspect the specific combination report; no tolerance expansion is allowed.

### Task 2.3 — Measure dimensions and budgets

- Goal: record total height, diameter, triangles, and unique materials.
- Modified files: `blender/validate_phase2c_matrix.py`.
- Prerequisite: Task 2.2 passes.
- Implementation: use world-space render-mesh bounds and current budgets of 150000 triangles and 6 materials.
- Command: rerun the single-combination command.
- Expected: numeric measurements and no budget violations.
- Stop condition: empty mesh set, non-finite measurement, or budget violation.
- Commit: include with Task 2.1.
- Recovery: report the frozen part combination that exceeds budget; do not change geometry in Phase 2C.

## Stage 3 — Collision matrix

### Task 3.1 — Run staged proxy collision checks

- Goal: test every selected part pair using existing closed proxies.
- Modified files: `blender/validate_phase2c_matrix.py`.
- Prerequisite: Stage 2 passes.
- Implementation: AABB screen, BVH triangle overlap, voxel volume estimate, and existing legal-interface exclusions.
- Command: run one representative combination and inspect its collision details.
- Expected: every pair records stage, result, approximate volume, and location when applicable.
- Stop condition: collider missing, proxy invalid, or collision calculation error.
- Commit: include with matrix validator.
- Recovery: reproduce the combination ID and inspect the existing proxy; never ignore an exception silently.

### Task 3.2 — Preserve CONTACT_REVIEW as unresolved

- Goal: ensure low-volume intersections cannot become PASS automatically.
- Modified files: `blender/validate_phase2c_matrix.py`, `tests/test_phase2c_matrix.py`.
- Prerequisite: Task 3.1 passes.
- Implementation: priority is FAIL, then CONTACT_REVIEW, then PASS; retain all details in reports.
- Command: unit tests plus a single-combination reproduction.
- Expected: CONTACT_REVIEW propagates to the combination and final technical gate.
- Stop condition: any path maps CONTACT_REVIEW to PASS.
- Commit: include with collision implementation.
- Recovery: restore strict classification logic.

## Stage 4 — Reports

### Task 4.1 — Generate deterministic matrix outputs

- Goal: write the CSV, full JSON, collision summary, and Markdown summary.
- Modified files: none. New outputs: `reports/assembly_matrix.csv`, `reports/validation/phase2c-combination-matrix.json`, `reports/validation/phase2c-collision-summary.json`, and `reports/phase2c-validation-summary.md`.
- Prerequisite: Stages 1–3 pass for all combinations.
- Implementation: stable ID ordering and all required measurement columns; add the audit note to every summary.
- Command: `powershell -ExecutionPolicy Bypass -File scripts/test_phase2c.ps1`.
- Expected: 288 CSV rows and matching JSON counts.
- Stop condition: output count, schema, sort order, or audit-note mismatch.
- Commit: include reports with the technical result.
- Recovery: rerun from the unchanged tagged baseline.

## Stage 5 — Failure reproduction

### Task 5.1 — Re-run one combination by ID

- Goal: reproduce a FAIL or CONTACT_REVIEW without executing the full matrix.
- Modified files: `blender/validate_phase2c_matrix.py`. New output: one reproduction JSON.
- Prerequisite: Stage 1 deterministic mapping exists.
- Implementation: accept `--combination-id`, validate only that tuple, and write its full evidence.
- Command: `blender.exe --background --python blender/validate_phase2c_matrix.py -- --combination-id nss-p2c-0001`.
- Expected: exactly one result and no matrix rewrite.
- Stop condition: unknown ID or more than one executed combination.
- Commit: include with matrix validator.
- Recovery: use enumeration output to confirm the ID.

## Stage 6 — Determinism

### Task 6.1 — Compare two single-thread runs

- Goal: prove stable logical output without adding speculative parallelism.
- Modified files: none. New output: `reports/validation/phase2c-determinism.json`.
- Prerequisite: full run completes once.
- Implementation: rerun the matrix, normalize runtime-only fields, and compare the deterministic digest and sorted records.
- Command: the Phase 2C test runner executes the validator twice in determinism mode.
- Expected: identical normalized digest and ordering.
- Stop condition: report drift other than duration/timestamp fields.
- Commit: include with final reports.
- Recovery: remove nondeterministic iteration; do not add concurrency.

## Stage 7 — Regression

### Task 7.1 — Verify frozen artifacts and previous gates

- Goal: confirm Phase 2C changed only validation infrastructure.
- Modified files: none. New output: `reports/validation/phase2c-baseline-verification.json`.
- Prerequisite: matrix run completed.
- Implementation: rerun raw/spec/semantic/NSS-V1 hashes and existing Storm Attack, Phase 2A, Phase 2B, and Phase 2B-R1 checks.
- Command: `python scripts/manage_phase2c_provisional_baseline.py verify` plus existing regression commands in the runner.
- Expected: zero binary drift, semantic regression, spec drift, or interface drift.
- Stop condition: any drift or previous-gate failure.
- Commit: include with final reports.
- Recovery: stop the matrix and restore the tagged provisional baseline.

## Stage 8 — Final technical gate

### Task 8.1 — Classify the provisional technical result

- Goal: emit one permitted Phase 2C technical status without changing visual-review state.
- Modified files: none. Outputs: Phase 2C summaries.
- Prerequisite: all earlier stages executed.
- Implementation: require 288 unique combinations, no omissions, no interface or budget errors, no FAIL, no unresolved CONTACT_REVIEW, baseline stability, report completeness, and no assembled-GLB batch export.
- Command: `python scripts/report_phase2c.py` through `scripts/test_phase2c.ps1`.
- Expected: one of the two authorized technical statuses and the unchanged open visual-review status.
- Stop condition: waiver invalid/expired or any technical gate failure.
- Commit: `test: validate Phase 2C combination matrix under waiver`.
- Recovery: use the failing combination ID; do not change frozen geometry, NSS-V1, or tolerances.

## Completion checklist

- Exactly 288 combinations; duplicates and omissions are zero.
- Interface, role, mount, transform, dimension, triangle, and material checks are present.
- Collision FAIL and unresolved CONTACT_REVIEW counts control the final result.
- No 288 assembled GLBs are written.
- One combination can be reproduced independently.
- Provisional baseline, specs, visible geometry, materials, and NSS-V1 remain unchanged.
- Visual review remains open and the waiver audit note appears in every summary.
- No product-release, manufacturing, safety, material-certification, or legal-originality conclusion is emitted.
