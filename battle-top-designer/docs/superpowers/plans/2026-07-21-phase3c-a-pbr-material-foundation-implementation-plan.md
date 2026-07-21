# Phase 3C-A PBR Material Foundation Implementation Plan

Date: 2026-07-21

Design: `docs/superpowers/specs/2026-07-21-phase3c-a-pbr-material-foundation-design.md`

Starting HEAD: `db131d5c7cbba444380d2ec40cb3510d163d07b1`

Status: approved design; implementation not started

## Objective and fixed boundaries

Build the approved Blender-authoritative PBR foundation for all 16 NSS-V1 parts while preserving visible geometry, mounts, interfaces, assembly behavior, collision proxies, material slot order, and the 288-combination matrix.

Hard boundaries:

- Do not modify historical Stage 8 artifacts or rerun Full Stage 8, Stability Sweep, or repeated Playwright stress gates.
- Do not add UVs, textures, decals, logos, external HDRIs, showcase UI, or part-specific Phase 3C-B/C polish.
- Do not add a Web-side part-to-material database.
- Do not modify root RIPTOP Arena material or lighting code.
- Stop immediately on geometry, NSS-V1, slot-order, deterministic-generation, or protected-evidence drift.
- Stage and commit only the files named by the completed task. Preserve all unrelated workspace changes.

## Stage 0 — Read-only baseline and environment gate

### Task 0.1 — Capture Phase 3C-A protected input inventory

**Goal:** Establish a new read-only comparison manifest without changing existing GLBs or baselines.

**Modify:** none.

**Add:** `reports/validation/phase3c-a-input-inventory.json` only after the command and schema are reviewed.

**Implementation:**

1. Record HEAD, Blender/Node/Python versions, material catalog SHA, part-spec SHAs, interface SHA, 16 GLB SHAs, Stage 7 formal report SHA, and formal Stage 8 run identity.
2. For each GLB record positions, indices, node transforms, mesh/primitive counts, material slot order, attributes, and absence of `TEXCOORD_0/1`.
3. Record existing triangle and draw-call ranges.
4. Do not rewrite or normalize any source asset.

**Verify:** inventory contains exactly 16 part records, all `interface_id=NSS-V1`, 72 primitives, zero UV attributes, and the authoritative Stage 7 SHA.

**Stop if:** HEAD or protected evidence differs from the approved state, any GLB is missing, or the inventory process writes to an input.

**Commit:** no standalone commit; include with Stage 1 only after validation passes.

## Stage 1 — Schemas, profiles, and validator

### Task 1.1 — Define the visual-profile schema and six archetypes

**Goal:** Make invalid PBR data fail before Blender starts.

**Modify:**

- `schemas/material.schema.json`
- `scripts/validate_specs.py`
- `specs/materials.json`

**Add:**

- `schemas/visual-profile.schema.json`
- an initially minimal `specs/visual-profiles.json` fixture containing one valid profile only during test development, then replaced by Task 1.2

**Implementation:**

1. Add the exact archetype enum: `painted_metal`, `polished_metal`, `engineering_plastic`, `transparent_polycarbonate`, `rubber`, `energy_accent`.
2. Add bounded PBR fields and conditional requirements for transmission/IOR/thickness and emissive properties.
3. Add the exact surface-role enum from the design.
4. Validate unique part IDs, unique slot indices, contiguous ordering, source material IDs, profile completeness, and no unknown fields.
5. Add negative self-test fixtures for every required failure class.

**Verify:**

```powershell
python scripts/validate_specs.py --self-test
python scripts/validate_specs.py --scope phase3c_a
python -m py_compile scripts/validate_specs.py
```

**Expected:** valid fixture passes; missing profile, unknown role/archetype, range violation, incomplete transparent material, duplicate slot, and source-slot mismatch all fail.

**Stop if:** validation requires changing part geometry JSON, interface definitions, or existing material-slot order.

### Task 1.2 — Populate all 16 part profiles

**Goal:** Encode the approved visual identity without modifying part specs.

**Modify:** `specs/visual-profiles.json`.

**Implementation:**

1. Add exactly one profile per catalog part.
2. Match every slot index and `source_material_id` to the existing part JSON.
3. Use only approved archetypes and surface roles.
4. Keep energy accents restrained and use transparent physical fields only where required.
5. Keep all colors original to Nova Spin System and do not import external palettes, logos, or reference identities.

**Verify:** spec validation reports 16/16 profiles and zero slot mismatches; serialized output is deterministic.

**Commit after Tasks 1.1–1.2:**

```text
feat(visual): define Phase 3C PBR profiles
```

## Stage 2 — Deterministic Blender material builder

### Task 2.1 — Convert validated profiles into Principled materials

**Goal:** Make Blender the only authority that turns visual profiles into GLB materials.

**Modify:**

- `blender/lib/materials.py`
- `blender/generate_parts.py`

**Add:** `blender/test_phase3c_materials.py` for focused Blender background-mode material tests.

**Implementation:**

1. Load `visual-profiles.json` once and select by `part_spec.id`.
2. Validate slot order again at the Blender boundary.
3. Create deterministic material names containing part ID, slot index, and archetype.
4. Configure Principled Base Color, Metallic, Roughness, Alpha, Transmission, IOR, Thickness, and restrained Emission as applicable.
5. Store `part_id`, `slot_index`, `source_material_id`, `surface_role`, and `archetype` in material extras.
6. Set backface behavior from validated data and preserve `double_sided=false` for all Phase 3C-A profiles.
7. Do not use random values, image nodes, UV nodes, or custom shaders.

**Verify:**

```powershell
python -m py_compile blender/lib/materials.py blender/generate_parts.py
& $Blender --background --python blender/test_phase3c_materials.py
```

**Expected:** every archetype produces the expected Principled values and metadata; repeated creation produces equivalent normalized material records.

**Stop if:** Blender cannot export required physical fields consistently or requires geometry changes. Report the unsupported field instead of adding a Web override.

**Commit:**

```text
feat(blender): generate deterministic PBR materials
```

## Stage 3 — Geometry-safe GLB regeneration

### Task 3.1 — Add a material-aware geometry freeze validator

**Goal:** Allow intended material changes while rejecting all geometry and interface drift.

**Modify:** existing fingerprint/validation code only where needed.

**Add:** `reports/validation/phase3c-a-geometry-freeze.json` as generated evidence.

**Implementation:**

1. Compare pre/post POSITION, indices, node transforms, dimensions, mounts, primitive topology, attribute names, and material-slot order.
2. Ignore only approved material factors, material names/extras, and supported material extensions.
3. Explicitly assert `TEXCOORD_0/1` remain absent.
4. Report differences by part and JSON path.

**Verify:** an intentional material-only fixture passes; position, index, transform, slot-order, and UV mutations each fail.

### Task 3.2 — Regenerate and validate all 16 GLBs

**Goal:** Produce the Phase 3C-A material assets without changing physical structure.

**Modify:** `public/models/parts/*.glb` for exactly the 16 approved parts.

**Implementation:**

1. Generate each part once into a fresh, explicit Phase 3C-A output location or validated replacement workflow; never delete directories in bulk.
2. Validate the generated GLB before replacing its current counterpart.
3. Compare against Stage 0 geometry inventory.
4. Regenerate a second time and compare normalized material and geometry records for determinism.
5. Confirm each GLB material carries the approved metadata and extension set.

**Verify:**

- 16/16 GLBs pass glTF validation with zero errors and zero warnings.
- Geometry mismatch count is zero.
- Slot-order mismatch count is zero.
- UV attribute count remains zero.
- Material/profile mismatch count is zero.
- Second-generation normalized digest matches the first.

**Stop if:** any GLB fails before replacement, any geometry fingerprint changes, or generation touches a non-part asset.

**Commit after Tasks 3.1–3.2:**

```text
feat(assets): apply Phase 3C PBR profiles
```

## Stage 4 — NSS-V1 and 288-combination regression

### Task 4.1 — Prove material-only asset change

**Goal:** Confirm all assemblies remain technically identical apart from materials.

**Modify:** no product files.

**Add:** new Phase 3C-A validation reports only; do not overwrite Phase 2C or Stage 8 reports.

**Implementation and verification:**

1. Run spec self-tests and Phase 3C-A scope validation.
2. Run geometry, collision-proxy, mount, interface, and tip-profile checks for all 16 parts.
3. Run the existing Phase 2C matrix validator for all 288 combinations using a new report path.
4. Confirm combination count 288, failure count zero, mount mismatch zero, collision-proxy drift zero, and protected-report drift zero.

**Stop if:** an existing validator can only pass by updating an old baseline. Add a new Phase 3C-A material-aware report instead.

**Commit:** include generated Phase 3C-A reports only after they genuinely pass:

```text
test(visual): verify Phase 3C geometry freeze
```

## Stage 5 — Web studio environment

### Task 5.1 — Add deterministic environment ownership

**Goal:** Expose the new PBR response without replacing GLB materials.

**Modify:** `web-customizer/src/Scene.tsx` and focused unit-test files.

**Add:** a small focused module such as `web-customizer/src/scene/studioEnvironment.ts` only if it keeps lifecycle and disposal isolated.

**Implementation:**

1. Create a local `RoomEnvironment` and PMREM texture from the active renderer.
2. Assign and restore/dispose `scene.environment` through a focused React lifecycle component.
3. Explicitly pin ACES Filmic tone mapping and sRGB output color space.
4. Implement Low and Normal lighting values from the design; Low uses environment plus one key, Normal uses key/fill/rim.
5. Keep `shadows=false` in Phase 3C-A.
6. Preserve GLB materials; focus opacity remains the only temporary material mutation.

**Verify:** focused unit tests cover environment assignment, cleanup/disposal, quality selection, no external URL, and no material replacement. Then run TypeScript and production build.

```powershell
npm --prefix web-customizer run test:unit -- studioEnvironment
npm --prefix web-customizer exec tsc -- --noEmit -p web-customizer/tsconfig.json
npm --prefix web-customizer run build
```

**Stop if:** implementation adds network assets, increases shadow maps, leaks PMREM textures, or changes assembly/focus behavior.

**Commit:**

```text
feat(web): add deterministic studio lighting
```

## Stage 6 — Phase 3C-A closeout

### Task 6.1 — Run the approved non-browser gate

**Goal:** Produce a truthful Phase 3C-A implementation status without reopening Stage 8.

**Verify in order:**

1. Spec validator self-tests and `phase3c_a` scope.
2. Python/Node syntax.
3. 16 GLB glTF validation.
4. Geometry freeze report.
5. NSS-V1, collision, tip profile, assembly, and 288-combination reports.
6. Focused unit tests, all unit tests, TypeScript, build, and `git diff --check`.
7. Historical Stage 7 and Stage 8 evidence SHA checks.
8. Exact staged-file audit.

No Playwright, Stability Sweep, or Full Stage 8 is authorized by this plan. Static visual captures and human comparison require a separate local-browser authorization and do not alter the technical completion result.

**Success status:**

```text
PHASE3C_A_PBR_FOUNDATION_TECHNICALLY_VALIDATED
Human visual review: PENDING
Baseline: PROVISIONAL_NOT_FINAL
```

**Final commit, only if required reports and documentation remain outside prior commits:**

```text
chore(visual): close Phase 3C-A technical validation
```

## Execution order and stop policy

Execute strictly in this order:

```text
Stage 0 baseline
→ Stage 1 schema/profiles
→ Stage 2 Blender builder
→ Stage 3 GLBs
→ Stage 4 geometry/NSS matrix
→ Stage 5 Web studio environment
→ Stage 6 closeout
```

Only one stage may be in progress. A failed stage is preserved and reported; later stages do not start. No automatic retry, baseline rewrite, artifact cleanup, or unrelated refactor is permitted.
