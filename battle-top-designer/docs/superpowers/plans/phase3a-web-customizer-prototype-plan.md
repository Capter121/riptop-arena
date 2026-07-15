# Phase 3A web customizer prototype implementation plan

Status: awaiting implementation approval

Target status after all automated gates pass: **Phase 3A internal prototype PASS under provisional visual review**

Current visual-review status: **Phase 2B visual review deferred pending real reviewers**

Baseline: `v0.2.0-rc1-technical-baseline` (`PROVISIONAL_NOT_FINAL`)

> Human visual review remains pending.
> Development continued under a documented provisional internal-prototype decision.

## Outcome and success criteria

Build a mobile-first, fully offline internal web prototype that assembles the existing 16 GLBs into all 288 legal combinations. The browser uses GLB mount metadata and never calls Blender or changes permanent model transforms. The existing `preview/` application and its browser regressions remain intact.

Success requires:

- five selectable layers with cardinalities `2 × 4 × 3 × 3 × 4`;
- 288 stable, unique combination IDs matching Phase 2C ordering;
- mount-based assembly around one center axis;
- camera controls, presets, auto-rotation, loading and error states;
- reversible five-layer exploded animation and approved Assist/Gear/Tip compensation;
- validated local persistence and JSON import/export;
- concept-only attributes with an explicit disclaimer;
- zero external runtime requests and zero browser console/page/request errors;
- no protected-file drift and no copied source GLBs.

## Chosen architecture

Create `web-customizer/` beside `preview/`. Vite uses an absolute `publicDir` pointing to the existing project `public/models/parts` directory, so development and production builds consume the same 16-model source without including assembled GLBs. The generated distribution packages one hash-identical copy of each part, but the application source tree contains no second GLB set. A build-time catalog extractor reads the protected part specifications, verifies the provisional baseline hashes, and writes a generated, read-only product catalog containing display data but no new interface values.

The runtime is divided into six bounded units:

1. `catalog`: part IDs, display labels, concept attributes, family order, and combination ranking.
2. `assets`: GLTF loading, 16-entry parse cache, cloned scene instances, disposal, and errors.
3. `assembly`: mount lookup and transform composition.
4. `state`: Zustand selection, focus, animation, camera, persistence, and import validation.
5. `scene`: React Three Fiber rendering, controls, lighting, animation, focus, and debug axis.
6. `ui`: mobile-first category navigation, selectors, attributes, status, and action controls.

For each adjacent pair, the permanent lower-part transform is calculated from the upper bottom mount and lower top mount:

`lowerRoot = upperRoot × upperBottomMount × inverse(lowerTopMount)`

Animation offsets are applied to a separate transient presentation group. Permanent mount transforms remain unchanged and are compared before and after every animation test.

## Protected-file gate

Before and after every stage, run the provisional-baseline verifier and compare these protected paths with the baseline tag:

```powershell
python scripts/validate_phase2c_waiver.py
python scripts/manage_phase2c_provisional_baseline.py verify
git diff --name-only v0.2.0-rc1-technical-baseline -- specs public/models docs/baselines/v0.2.0-rc1-technical-baseline.json reports/validation/phase2c-final-gate.json
```

Any output from the protected-path diff is a hard stop.

## Stage 0 — Governance and migration safety

### Task 0.1 — Enforce the Phase 3 decision

- Goal: make provisional status and report wording testable.
- Modified files: `web-customizer/package.json` adds the governance command after Task 0.3 creates it.
- New files: `web-customizer/scripts/check-governance.mjs` and focused fixtures/tests.
- Prerequisites: the decision record, waiver, provisional baseline, and Phase 2C gate exist and validate unchanged.
- Steps: verify the two current statuses, waiver expiration, baseline ID/status, and required two-line report notice.
- Command: `npm --prefix web-customizer run check:governance`.
- Tests: valid records pass; expired, missing, changed, or elevated-status fixtures fail.
- Expected: governance report is PASS without changing any source artifact.
- Stop: any authorization, expiration, status, or hash mismatch.
- Commit: `chore(web): establish Phase 3A governance gate`.
- Recovery: restore the documented records; never manufacture review data.

### Task 0.2 — Preserve the existing preview

- Goal: prove the new application does not replace or break `preview/`.
- Modified files: `web-customizer/package.json` adds a read-only preview regression command; `preview/main.js` is not edited.
- New files: none.
- Prerequisites: Task 0.1 passes and the existing `preview/` test suite passes before integration.
- Steps: capture the preview source hash set and run existing Phase 2A, Phase 2B, and Assist-focus Playwright tests.
- Command: `npm --prefix preview test`.
- Tests: all existing preview suites pass with zero external requests.
- Expected: preview source hashes remain unchanged.
- Stop: any preview test or hash failure.
- Commit: include with Task 0.1.
- Recovery: remove only new integration wiring; do not rewrite preview tests.

### Task 0.3 — Pin the offline toolchain

- Goal: create a reproducible React/TypeScript/Vite/R3F/Zustand environment.
- Modified files: none outside the new `web-customizer/` directory.
- New files: `web-customizer/package.json`, lockfile, TypeScript/Vite/Vitest/Playwright configuration, license inventory, and `.gitignore`.
- Prerequisites: Tasks 0.1–0.2 establish the governance and preview-regression gates.
- Steps: install exact versions; keep Three.js compatible with existing `0.185.1`; forbid CDN scripts, remote fonts, analytics, and Draco unless a local decoder is later approved.
- Command: `npm --prefix web-customizer install` and `npm --prefix web-customizer run check:offline-dependencies`.
- Tests: lockfile has no ranges; HTML and source contain no HTTP(S) runtime imports.
- Expected: development server starts without network access after installation.
- Stop: unpinned package, CDN, missing license, or incompatible Three.js peer dependency.
- Commit: include with Task 0.1.
- Recovery: restore the lockfile; do not fall back to remote modules.

## Stage 1 — Storm Attack vertical slice

### Task 1.1 — Scaffold the isolated application shell

- Goal: render a mobile-first shell without loading a model.
- Modified files: `web-customizer/package.json` adds build and development commands.
- New files: `web-customizer/index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, and `vite.config.ts`.
- Prerequisites: Stage 0 passes with exact offline dependencies installed and the existing preview unchanged.
- Steps: configure Vite `publicDir` to the existing `../public/models/parts`; create the viewport, loading panel, and prototype/governance notices.
- Command: `npm --prefix web-customizer run build`.
- Tests: the source tree contains no GLB; the generated distribution contains exactly 16 hash-identical part GLBs, no assembled GLB, and no external URL.
- Expected: empty shell works at desktop and 390×844 viewports.
- Stop: protected files change or source GLBs appear under `web-customizer/public/models`.
- Commit: `feat(web): add Storm Attack application shell`.
- Recovery: remove only the new application shell.

### Task 1.2 — Generate the read-only product catalog

- Goal: expose the 16 approved IDs and display metadata without changing specs.
- Modified files: `web-customizer/package.json` adds catalog build/check commands.
- New files: `web-customizer/scripts/build-product-catalog.mjs`, `src/generated/parts.catalog.json`, and concept-attribute source data.
- Prerequisites: Task 1.1 passes and all 16 protected spec/baseline hashes validate.
- Steps: read all 16 part specs, verify their hashes against the provisional baseline, group cardinalities 2/4/3/3/4, and extract only approved display fields.
- Command: `npm --prefix web-customizer run catalog:build` and `npm --prefix web-customizer run catalog:check`.
- Tests: generated catalog is deterministic; missing, extra, duplicate, wrong-family, or wrong-interface records fail.
- Expected: exactly 16 records and one NSS-V1 interface ID.
- Stop: spec or baseline hash mismatch.
- Commit: include with Task 1.1.
- Recovery: regenerate from unchanged specs; never hand-edit generated interface data.

### Task 1.3 — Implement GLB loading and bounded cache

- Goal: load only the five Storm Attack parts with useful loading/error states.
- Modified files: `web-customizer/src/App.tsx` wires loading/error state.
- New files: `web-customizer/src/assets/gltfCache.ts`, `src/assets/modelInstance.ts`, and focused tests.
- Prerequisites: Task 1.2 produces a valid deterministic catalog.
- Steps: resolve `<id>.glb` against Vite's local base URL; cache parsed sources by part ID; clone scene instances; clone materials only when presentation effects require it; dispose removed instances without mutating cache sources.
- Command: `npm --prefix web-customizer run test:unit -- gltfCache`.
- Tests: deduplicated concurrent loads, cache hit, HTTP failure, malformed GLB, instance disposal, and cache-source immutability.
- Expected: each Storm Attack URL is requested once per browser session.
- Stop: uncaught load error, duplicate request, or disposed cached geometry.
- Commit: include with Task 1.1.
- Recovery: clear only runtime cache state and display the load error.

### Task 1.4 — Display assembled Storm Attack

- Goal: render the fixed default combination before adding selection.
- Modified files: `web-customizer/src/App.tsx` mounts the 3D scene.
- New files: `web-customizer/src/scene/CustomizerCanvas.tsx`, `AssemblyRoot.tsx`, `CameraRig.tsx`, `Lighting.tsx`, and Storm Attack browser tests.
- Prerequisites: Tasks 1.1–1.3 pass and the five Storm Attack GLBs load from the shared model source.
- Steps: load five parts, validate mount objects and interface metadata, assemble around the center axis, add slow rotation, pointer/touch orbit, zoom, reset, four view presets, loading status, and hidden-by-default axis helper.
- Command: `npm --prefix web-customizer run test:e2e -- storm-attack`.
- Tests: five models load; mounts exist; axis error is within browser epsilon; camera controls and presets change expected state.
- Expected: Storm Attack is centered and interactive with zero console errors.
- Stop: mount missing, wrong interface, non-finite transform, external request, or failed GLB.
- Commit: include with Task 1.1.
- Recovery: remain on the error panel; do not center parts by guessed offsets.

## Stage 2 — Single Blade switching

### Task 2.1 — Add typed combination state

- Goal: introduce one immutable source of truth for the five selected IDs.
- Modified files: `web-customizer/src/App.tsx` consumes the typed selection state.
- New files: `web-customizer/src/state/customizerStore.ts`, `src/domain/combination.ts`, and focused tests.
- Prerequisites: Stage 1 passes with a fixed, correctly assembled Storm Attack scene.
- Steps: define the exact configuration shape, default Storm Attack values, actions, derived name, loading transaction ID, and view/focus state.
- Command: `npm --prefix web-customizer run test:unit -- customizerStore`.
- Tests: default state, legal update, rejected ID, stale loading transaction, and reset.
- Expected: state changes do not directly mutate Three.js objects.
- Stop: illegal ID enters state or state and scene selection diverge.
- Commit: `feat(web): support one Blade replacement`.
- Recovery: reset to the immutable default configuration.

### Task 2.2 — Implement mount-based replacement

- Goal: switch Storm Fang to one alternate Blade without moving other layers permanently.
- Modified files: `web-customizer/src/scene/AssemblyRoot.tsx` delegates permanent placement to the assembler.
- New files: `web-customizer/src/assembly/mountAssembler.ts`, `mountMetadata.ts`, and focused tests.
- Prerequisites: Task 2.1 provides a valid current combination and loading transaction state.
- Steps: find named mounts, validate roles and NSS-V1, compose transforms, snapshot permanent matrices, replace the Blade instance, and recompute the four connections.
- Command: `npm --prefix web-customizer run test:unit -- mountAssembler`.
- Tests: correct formula, missing mount, wrong role, wrong interface, center-axis error, and unchanged neighboring permanent matrices.
- Expected: both tested Blades assemble from metadata with no hard-coded permanent Z offsets.
- Stop: any permanent alignment exceeds the browser epsilon.
- Commit: include with Task 2.1.
- Recovery: keep the previous Blade and show a replacement error.

### Task 2.3 — Add the first Blade selector

- Goal: prove UI-to-state-to-loader-to-assembly flow with one variable layer.
- Modified files: `web-customizer/src/App.tsx` connects Blade selection to the store and loader.
- New files: `web-customizer/src/ui/PartTabs.tsx`, `PartStrip.tsx`, and Blade-switch Playwright coverage.
- Prerequisites: Tasks 2.1–2.2 pass for Storm Fang and one alternate Blade.
- Steps: show Blade choices, keyboard/touch selection, selected state, loading indicator, and fallback to the prior valid Blade on failure.
- Command: `npm --prefix web-customizer run test:e2e -- blade-switch`.
- Tests: switch away and back; no duplicate GLB request; combination name updates; canvas remains interactive.
- Expected: Storm Attack and one alternate Blade work end to end.
- Stop: visible stale state, blank canvas, or request/console failure.
- Commit: include with Task 2.1.
- Recovery: restore the previous selection atomically.

## Stage 3 — Five-layer switching

### Task 3.1 — Enable all family catalogs

- Goal: expose 2 Core, 4 Blade, 3 Assist, 3 Gear, and 4 Tip choices.
- Modified files: catalog selectors and `web-customizer/src/ui/PartTabs.tsx`.
- New files: focused family-cardinality tests if not already present.
- Prerequisites: Stage 2 passes and all 16 catalog records remain valid.
- Steps: derive tabs from family metadata, keep deterministic ordering, and use accessible labels while model IDs remain internal.
- Command: `npm --prefix web-customizer run test:unit -- catalogSelectors`.
- Tests: exact cardinalities and no duplicate part IDs.
- Expected: all 16 choices are reachable on mobile without page overflow.
- Stop: incorrect family count or unapproved ID.
- Commit: `feat(web): enable five-layer part selection`.
- Recovery: disable the invalid family and retain the last valid combination.

### Task 3.2 — Replace any one layer safely

- Goal: generalize the proven Blade transaction to Core, Assist, Gear, and Tip.
- Modified files: `web-customizer/src/scene/AssemblyRoot.tsx` and loader transaction logic.
- New files: five-layer replacement lifecycle tests.
- Prerequisites: Task 3.1 exposes exact family cardinalities and Stage 2 replacement remains green.
- Steps: load the candidate, validate mounts before removal, swap only the selected instance, reassemble downstream layers, and dispose the old instance.
- Command: `npm --prefix web-customizer run test:unit -- layerReplacement`.
- Tests: all five layer types, rapid repeated switching, rejected stale load, and no retained scene instance.
- Expected: only five active part roots remain in the scene.
- Stop: scene root leak, cached source mutation, or partial replacement.
- Commit: include with Task 3.1.
- Recovery: roll back the transaction to its captured five-part snapshot.

### Task 3.3 — Generate Phase 2C-compatible combination IDs

- Goal: give every legal selection a stable ID matching the Phase 2C Cartesian ordering.
- Modified files: the customizer store exposes the derived stable ID.
- New files: `web-customizer/src/domain/combinationId.ts` and focused tests.
- Prerequisites: Tasks 3.1–3.2 pass and the Phase 2C family ordering is available as read-only evidence.
- Steps: sort each family exactly as Phase 2C, compute mixed-radix rank, format `nss-p2c-0001` through `nss-p2c-0288`, and implement reverse lookup.
- Command: `npm --prefix web-customizer run test:unit -- combinationId`.
- Tests: all 288 IDs unique; boundary IDs and selected samples match `reports/assembly_matrix.csv`; round-trip rank/configuration succeeds.
- Expected: zero duplicates and zero omissions.
- Stop: any browser ID differs from Phase 2C evidence.
- Commit: include with Task 3.1.
- Recovery: restore the shared deterministic ordering; do not introduce a second ID scheme.

## Stage 4 — Reversible exploded assembly

### Task 4.1 — Separate permanent and presentation transforms

- Goal: guarantee animations cannot corrupt installed transforms.
- Modified files: `web-customizer/src/scene/AssemblyRoot.tsx` wraps permanent roots with presentation groups.
- New files: `web-customizer/src/scene/PartPresentationGroup.tsx`, `src/animation/transformSnapshots.ts`, and focused tests.
- Prerequisites: Stage 3 passes for all five replaceable layers and permanent matrices are testable.
- Steps: keep mount result on the permanent root; apply animation position/opacity/highlight only to a child presentation group; snapshot matrices before animation.
- Command: `npm --prefix web-customizer run test:unit -- transformSnapshots`.
- Tests: identity presentation state, nested transform composition, and exact restoration epsilon.
- Expected: permanent matrices never change during focus or exploded animation.
- Stop: permanent-matrix mutation.
- Commit: `feat(web): add reversible five-layer assembly animation`.
- Recovery: cancel animation and restore the captured presentation snapshot.

### Task 4.2 — Implement five-layer explode and reassemble

- Goal: animate Core upward, Blade slightly upward, Assist near center, Gear downward, and Tip farther downward.
- Modified files: scene controls and the action UI wire explode/reassemble actions.
- New files: `web-customizer/src/animation/assemblySequence.ts` and explode/restore Playwright tests.
- Prerequisites: Task 4.1 proves permanent and presentation transforms are isolated.
- Steps: define named assembled/light-exploded/full-exploded presentation states, reduce auto-rotation during transition, and support interruption and replay.
- Command: `npm --prefix web-customizer run test:e2e -- explode-restore`.
- Tests: ordering, direction, intermediate state, interrupted transition, reassembly, and restoration error.
- Expected: restoration error remains below the declared epsilon for all five layers.
- Stop: drift, overlap caused by wrong direction, or unrecoverable interrupted state.
- Commit: include with Task 4.1.
- Recovery: snap presentation groups to assembled state; permanent mounts remain untouched.

## Stage 5 — Approved UX compensation

### Task 5.1 — Implement Assist focus

- Goal: make the partially hidden Assist legible during selection.
- Modified files: scene presentation/material handling and Assist selection flow.
- New files: `web-customizer/src/focus/assistFocus.ts`, an Assist scene effect component, and focused tests.
- Prerequisites: Stage 4 passes, including interruption-safe reassembly and transform restoration.
- Steps: slow rotation, light explode, raise Assist, clone/fade Blade materials, highlight Assist outline, move to uniform 45° camera, replace, reassemble, restore material references, and resume rotation.
- Command: `npm --prefix web-customizer run test:e2e -- assist-focus`.
- Tests: Assist offset, Blade opacity/depth state, highlight duration, camera state, material restoration, and permanent transform equality.
- Expected: Heavy, Guard, and Air all follow the same deterministic focus lifecycle.
- Stop: cached material mutation, focus leak, or restore error.
- Commit: `feat(web): add approved part-focus compensation`.
- Recovery: clear transient materials and reset presentation/camera state.

### Task 5.2 — Implement Gear side focus

- Goal: reveal Low, Medium, and High total-height differences.
- Modified files: Gear selection flow and camera overlay integration.
- New files: `web-customizer/src/focus/gearFocus.ts`, height overlay component, and focused tests.
- Prerequisites: Task 5.1 passes and the shared focus lifecycle can restore camera/presentation state.
- Steps: switch to side camera, show a common ground datum and concept height readout, replace Gear, then reassemble.
- Command: `npm --prefix web-customizer run test:e2e -- gear-focus`.
- Tests: side-view camera ID, ordered heights, common datum, restore, and no permanent transform change.
- Expected: three Gear selections produce distinguishable measured total heights.
- Stop: height ordering conflicts with frozen geometry or camera does not restore.
- Commit: include with Task 5.1.
- Recovery: hide overlay and restore the prior camera preset.

### Task 5.3 — Implement Tip low-angle focus and debug axis

- Goal: reveal Flat, Ball, Needle, and Taper contact differences while keeping axes hidden by default.
- Modified files: Tip selection flow, camera rig, and debug controls.
- New files: `web-customizer/src/focus/tipFocus.ts` and focused tests.
- Prerequisites: Tasks 5.1–5.2 pass without permanent-transform or material drift.
- Steps: move to bottom/low camera, focus the contact area, replace Tip, restore; create axes helper only when debug state is true.
- Command: `npm --prefix web-customizer run test:e2e -- tip-focus debug-axis`.
- Tests: low-view camera ID, four Tip choices, contact-region visibility, default axes count 0, debug axes count 1, and restore.
- Expected: Tip focus works without turning the model upside down permanently.
- Stop: default colored axes visible or camera/transform restore error.
- Commit: include with Task 5.1.
- Recovery: dispose the helper and reset camera/presentation state.

## Stage 6 — Combination tools

### Task 6.1 — Add versioned localStorage persistence

- Goal: save and restore one legal configuration locally.
- Modified files: customizer store initialization and save controls.
- New files: `web-customizer/src/persistence/localCombination.ts` and focused tests.
- Prerequisites: Stages 0–5 pass and the exact five-field combination schema is stable.
- Steps: use a namespaced schema/version key, validate before hydration, ignore corrupt or obsolete values, and never store Three.js objects.
- Command: `npm --prefix web-customizer run test:unit -- localCombination`.
- Tests: save, reload, corrupt JSON, unknown schema, illegal part, and storage denial.
- Expected: a valid selection survives reload; invalid data falls back to Storm Attack with a notice.
- Stop: invalid persisted data reaches the store.
- Commit: `feat(web): add combination persistence and exchange`.
- Recovery: remove only the customizer storage key.

### Task 6.2 — Add JSON export and validated import

- Goal: exchange the exact five-field configuration without hidden state.
- Modified files: import/export controls and atomic load transaction wiring.
- New files: `web-customizer/src/persistence/combinationJson.ts` and focused tests.
- Prerequisites: Task 6.1 establishes versioned validation and fallback behavior.
- Steps: export canonical sorted JSON; parse files/text; reject extra/missing fields, wrong types, unknown IDs, or family mismatches; apply atomically after model preflight.
- Command: `npm --prefix web-customizer run test:unit -- combinationJson`.
- Tests: round trip, malformed JSON, wrong family, unknown ID, additional key, and load failure rollback.
- Expected: imported configuration receives the same stable combination ID.
- Stop: partial import or unvalidated state mutation.
- Commit: include with Task 6.1.
- Recovery: retain the previous valid combination and show a field-specific error.

### Task 6.3 — Add random and Storm Attack reset

- Goal: generate a legal uniform random combination and restore the fixed default.
- Modified files: domain actions, customizer store, and action controls.
- New files: deterministic random-combination tests.
- Prerequisites: Tasks 6.1–6.2 pass and all 288 legal states have stable IDs.
- Steps: choose one ID per family using browser crypto randomness, validate, transact the five loads, and provide an explicit Storm Attack reset.
- Command: `npm --prefix web-customizer run test:unit -- randomCombination`.
- Tests: deterministic injected RNG, family bounds, 288 reachable configurations, atomic rollback, and exact default.
- Expected: every generated state is legal and has a stable ID.
- Stop: invalid or partially applied random state.
- Commit: include with Task 6.1.
- Recovery: invoke the default-reset action.

## Stage 7 — Attributes, mobile UI, and performance

### Task 7.1 — Add concept-only attributes

- Goal: display attack, defense, stamina, balance, weight, and height without physical-performance claims.
- Modified files: the combination view adds the concept-attribute panel and required disclaimer.
- New files: `web-customizer/src/data/concept-attributes.json`, `src/domain/attributes.ts`, panel component, and focused tests.
- Prerequisites: Stage 6 passes and product-only values are reviewed as non-physical prototype data.
- Steps: store documented prototype values independently from interface specs; aggregate with visible formulas; display `Concept attributes for prototype use only.`
- Command: `npm --prefix web-customizer run test:unit -- attributes`.
- Tests: six bounded outputs, deterministic aggregation, missing data failure, and disclaimer visibility.
- Expected: values update with every part change and remain explicitly conceptual.
- Stop: any value is labeled or described as measured battle performance.
- Commit: `feat(web): complete mobile prototype interface`.
- Recovery: hide the panel if product data is incomplete; do not infer physical values.

### Task 7.2 — Complete the mobile-first interface

- Goal: provide the requested viewport, five tabs, horizontal selector, current name, attributes, explode, random, save, import, and export controls.
- Modified files: `web-customizer/src/App.tsx`, focused UI components, and responsive styles.
- New files: mobile-layout and accessibility Playwright coverage.
- Prerequisites: Task 7.1 exposes all requested controls and six concept attributes.
- Steps: prioritize the 3D viewport, use touch-sized controls, horizontal overflow for parts, safe-area padding, keyboard focus, aria labels, and reduced-motion support.
- Command: `npm --prefix web-customizer run test:e2e -- mobile-layout accessibility`.
- Tests: 390×844 and 1280×800 layouts; no blocked controls, horizontal page overflow, or inaccessible actions.
- Expected: core workflow is usable without hover.
- Stop: clipped viewport, inaccessible action, or input covered by fixed UI.
- Commit: include with Task 7.1.
- Recovery: revert only the failing responsive rule/component.

### Task 7.3 — Enforce cache, memory, and offline budgets

- Goal: keep five active models, reuse fetched GLBs, and prevent obvious leaks.
- Modified files: development-only diagnostics wiring and Playwright configuration.
- New files: performance tests and an offline request guard.
- Prerequisites: Tasks 7.1–7.2 pass at desktop and 390×844 viewports.
- Steps: expose development-only counts for scene roots, cache entries, geometries, materials, render calls, and external requests; cycle every part repeatedly.
- Command: `npm --prefix web-customizer run test:e2e -- performance-offline`.
- Tests: active roots remain 5, cache entries never exceed 16, repeated switching reaches a stable object-count plateau, and external requests remain 0.
- Expected: desktop and a Playwright mobile profile remain responsive.
- Stop: monotonically growing active scene resources, remote request, or uncaught WebGL error.
- Commit: include with Task 7.1.
- Recovery: dispose only abandoned instances and presentation clones; retain shared cache sources.

## Stage 8 — Full 288 gate and reporting

### Task 8.1 — Complete unit and state coverage

- Goal: cover catalog, IDs, store, assembly math, cache, JSON, localStorage, attributes, animation snapshots, and focus reducers.
- Modified files: existing unit suites and coverage configuration where gaps are identified.
- New files: missing focused suites under `web-customizer/tests/unit/`.
- Prerequisites: Stages 0–7 pass independently with their focused tests.
- Steps: use deterministic fixtures derived from generated catalog; do not mock protected hashes as passing when wrong.
- Command: `npm --prefix web-customizer run test:unit -- --coverage`.
- Tests: all named modules plus invalid/error branches.
- Expected: zero failed tests and agreed coverage thresholds recorded in the summary.
- Stop: skipped critical gate or flaky test.
- Commit: `test(web): validate Phase 3A internal prototype`.
- Recovery: fix implementation or deterministic fixture; never weaken assertions to pass.

### Task 8.2 — Validate all 288 browser configurations

- Goal: prove every configuration is legal and addressable without loading all GLBs simultaneously.
- Modified files: matrix test command in `web-customizer/package.json`.
- New files: 288-combination enumeration/state integration tests.
- Prerequisites: Task 8.1 passes and combination ordering still matches Phase 2C evidence.
- Steps: generate all configurations in memory, validate IDs and families, sample mount assembly across every family pair, and compare IDs to Phase 2C CSV.
- Command: `npm --prefix web-customizer run test:matrix`.
- Tests: count 288, duplicates 0, omissions 0, illegal IDs 0, Phase 2C mismatches 0.
- Expected: deterministic digest recorded in the Phase 3A summary.
- Stop: any mismatch or protected Phase 2C report drift.
- Commit: include with Task 8.1.
- Recovery: restore shared ordering/catalog extraction; do not hand-edit expected IDs.

### Task 8.3 — Run the complete Playwright gate

- Goal: validate the internal product flow in real Chromium desktop and mobile profiles.
- Modified files: existing `web-customizer/tests/e2e/` suites and Playwright configuration.
- New files: missing end-to-end scenarios and machine-readable browser-result plumbing.
- Prerequisites: Tasks 8.1–8.2 pass with 288 unique, legal IDs.
- Steps: test default load, all five categories, unique 288 IDs, explode/restore, Assist focus, Gear side view, Tip low view, localStorage, JSON round trip, loading errors, camera controls, and offline operation.
- Command: `npm --prefix web-customizer run test:e2e`.
- Tests: collect `console.error`, `pageerror`, `requestfailed`, and non-local requests; every count must be 0 in success scenarios.
- Expected: screenshots, traces only on failure, and a machine-readable browser report.
- Stop: any assertion, console, page, request, or external-network failure.
- Commit: include with Task 8.1.
- Recovery: reproduce the smallest failing test; do not update screenshots blindly.

### Task 8.4 — Run regressions, scope audit, and final internal report

- Goal: produce the two required Phase 3A reports without changing governance state.
- Modified files: `web-customizer/package.json` adds the complete gate/report command.
- New files: `reports/phase3a-validation-summary.md`, `reports/validation/phase3a-summary.json`, and a Phase 3A report generator.
- Prerequisites: Tasks 8.1–8.3 pass; waiver, baseline, Phase 2C, preview, and protected-path checks remain green.
- Steps: run waiver/baseline/Phase 2C verification, old preview tests, new unit/matrix/Playwright/build tests, protected-path diff, model-copy audit, license audit, and exact status-wording scan.
- Command: `npm --prefix web-customizer run test:all`.
- Tests: every automatic gate passes; all reports contain the required two-line notice; final status equals the allowed Phase 3A status exactly.
- Expected: internal prototype technical PASS, visual review still open, baseline and NSS-V1 hashes unchanged, Blender invocation count 0.
- Stop: any test failure, protected drift, missing notice, external request, copied GLB, or governance wording violation.
- Commit: include with Task 8.1.
- Recovery: revert only Phase 3A application/report changes; the provisional baseline and prior reports remain untouched.

## Planned report schema

`reports/validation/phase3a-summary.json` will include:

- final Phase 3A internal status;
- current visual-review status;
- provisional baseline/tag/hash verification;
- 16-part and 288-combination counts;
- unit, state, import/export, GLB, animation, focus, Playwright, preview-regression, offline, and build results;
- console, page, failed-request, and external-request counts;
- protected-file and copied-model audit results;
- exact dependency versions and licenses;
- the required provisional-development notice.

## Stage and commit discipline

Each stage is an independent quality gate. A stage advances only after its commands pass, protected paths remain unchanged, and its focused commit is created. If a model issue appears, record it under `reports/issues/phase3a/` and stop the affected slice; Phase 3A does not repair the model or relax NSS-V1/collision tolerances.

## Final scope checklist

- Existing `preview/` and its Playwright coverage remain available.
- No Blender generation or geometry/material/interface edits occur.
- No source GLB is duplicated inside `web-customizer/`.
- Runtime has no external dependency or network request.
- Only current assembly instances remain active; cache is bounded to 16 parsed GLBs.
- All 288 IDs match Phase 2C deterministic ordering.
- Permanent mount transforms survive every animation and focus cycle.
- Required Assist, Gear, Tip, camera, debug-axis, persistence, JSON, random, attributes, and mobile interactions are tested.
- Reports retain the pending visual-review status and internal-prototype limitation.
