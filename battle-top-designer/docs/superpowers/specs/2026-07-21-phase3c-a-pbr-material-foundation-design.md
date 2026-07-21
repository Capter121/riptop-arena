# Phase 3C-A PBR Material Foundation Design

## Status

- Design approved: 2026-07-21
- Target HEAD at design time: `12bd89d9fa21098e30d78c46ea9a02261c973aac`
- Scope: Nova Spin System Blender-to-GLB-to-Web Customizer visual pipeline
- Geometry contract: frozen
- Formal Stage 8 evidence: protected and not rerun by this phase

## Goal

Upgrade the 16 NSS-V1 parts from five shared generic materials to a deterministic, part-specific PBR foundation suitable for commercial product presentation. Phase 3C-A establishes material semantics and studio reflection without adding UVs, textures, decals, showcase UI, or part-specific polish.

## Non-goals

- No changes to positions, indices, dimensions, mounts, transforms, collision proxies, tip profiles, interfaces, assembly rules, or the 288-combination matrix.
- No UV channels, image textures, HDR downloads, logos, decals, animation, or new product modes.
- No Web-side replacement material database.
- No Playwright stress runs, Stability Sweep, or Full Stage 8 rerun.
- No changes to historical artifacts or formal Stage 8 evidence.

## Architecture

The Blender/GLB pipeline remains authoritative:

```text
specs/materials.json                 shared PBR archetypes
specs/visual-profiles.json           per-part surface identity
schemas/material.schema.json         archetype validation
schemas/visual-profile.schema.json   profile validation
            |
            v
Blender deterministic material generation
            |
            v
16 GLBs with embedded PBR materials and material metadata
            |
            v
GLTFLoader preserves materials
            +
Web Customizer deterministic studio environment and quality policy
```

The Web Customizer may adjust temporary presentation state such as focus opacity, but must not recreate authoritative materials from part IDs.

## Material Archetypes

Phase 3C-A defines exactly six archetypes:

| Archetype | Intended use | Core behavior |
|---|---|---|
| `painted_metal` | Blade attack surfaces | High metallic, medium-low roughness |
| `polished_metal` | Gears and connectors | High metallic, low roughness, clear reflection |
| `engineering_plastic` | Core/Assist structures | Non-metallic, medium roughness |
| `transparent_polycarbonate` | Core and lightweight inserts | Transmission, IOR, thickness, tinted color |
| `rubber` | Tip contact surfaces | Non-metallic, high roughness |
| `energy_accent` | Restrained special accents | Controlled emissive factor, no animation |

All numeric properties have schema limits. Transparent polycarbonate requires transmission, IOR, and thickness. Energy accents remain low intensity and must not create a separate animated shader.

## Visual Profile Schema

`specs/visual-profiles.json` contains one profile for every part ID. Each profile contains an ordered `slots` array. Every entry contains:

```text
slot_index
source_material_id
surface_role
archetype
base_color
metallic
roughness
optional transmission / ior / thickness
optional emissive_color / emissive_strength
```

The profile slot count, order, and `source_material_id` must match the existing part JSON `material_slots`. This preserves geometry-to-material assignment while allowing part-specific appearance.

Initial surface roles are limited to:

```text
shell
attack_edge
accent
transparent_insert
contact_rubber
connector_metal
```

Unknown roles or archetypes are validation errors. A missing profile is an error; generation must not fall back to a generic material.

## Part Identity Direction

- `core_solar_wolf`: solar gold/orange, ivory and restrained warm accent.
- `core_void_falcon`: purple-black, cobalt transparency and restrained blue-violet emission.
- `blade_storm_fang`: gunmetal and ice blue, sharp directional identity.
- `blade_iron_bastion`: heavy iron grey, silver and warning orange.
- `blade_orbit_halo`: pearl silver, cobalt and dark structural contrast.
- `blade_dual_comet`: gunmetal with paired cool/warm accents.
- Assists: Heavy uses massed brushed metal; Guard uses defensive silver/black; Air uses cobalt polycarbonate.
- Gears: Low, Medium, and High use distinct warm, neutral, and cool height identifiers.
- Tips: contact semantics distinguish rubber, structural plastic, and polished connector surfaces.

Exact values belong in the visual profile catalog and remain independently reviewable from geometry specs.

## Blender and GLB Behavior

The generic Blender material builder reads the archetype and validated profile overrides. It creates Principled BSDF materials, sets deterministic names and metadata, and exports supported glTF extensions for transmission and physical properties.

Requirements:

- Material slot count and order remain unchanged.
- `double_sided=false` must be preserved unless a profile explicitly and validly requires otherwise; Phase 3C-A profiles do not require it.
- Material metadata includes part ID, slot index, surface role, and archetype.
- Generation uses no random visual values.
- No `TEXCOORD_0` or `TEXCOORD_1` is introduced.

## Web Studio Environment

The Web Customizer adds a local deterministic `RoomEnvironment` processed by PMREM. No external HDRI is loaded.

Quality policies:

- Low: DPR 1, environment plus one key light, no shadows, reduced transmission cost.
- Normal: DPR 1-1.5, environment plus key/fill/rim lighting, no uncontrolled real-time shadow expansion.

Ambient and hemisphere intensities are reduced from the current flat-lighting setup so metallic roughness and silhouette lighting remain visible. Tone mapping and output color space are explicitly pinned to ACES Filmic and sRGB instead of relying solely on library defaults.

## Error Handling

Spec validation and generation stop immediately for:

- Missing or duplicate part profiles.
- Slot count, order, or source material mismatch.
- Unknown archetype or surface role.
- Out-of-range PBR values.
- Incomplete transparent material properties.
- Geometry fingerprint or NSS-V1 contract drift.

The Web runtime must not hide invalid assets with generic fallback materials.

## Validation

Required non-browser checks:

1. JSON schema and spec validation.
2. Python and Node syntax checks.
3. Deterministic generation comparison.
4. All 16 GLBs contain expected material names, metadata, factors, and extensions.
5. Before/after POSITION, indices, transforms, mounts, material slot order, and part dimensions match.
6. No UV attributes are introduced.
7. NSS-V1 assembly and 288 combinations remain valid.
8. TypeScript, build, focused unit tests, and `git diff --check` pass.
9. Static visual captures are reviewed for material differentiation and low/normal consistency when local browser execution is separately authorized.

Full Stage 8, Stability Sweep, and repeated Playwright stress validation are explicitly excluded.

## Performance Budgets

| Quality | Texture memory | Draw calls | Triangles | Lighting |
|---|---:|---:|---:|---|
| Low | 16 MB maximum | 40 maximum | 12k maximum | Environment plus one key |
| Normal | 32 MB maximum | 45 maximum | 15k maximum | Environment plus key/fill/rim |

Phase 3C-A adds no image textures. Compiled material variants should remain at or below 12, with shared archetypes preferred over per-part shader variants.

## Completion Criteria

- Six PBR archetypes pass schema validation.
- All 16 parts have complete, distinct visual profiles.
- Blender deterministically embeds authoritative materials in all GLBs.
- Web Customizer preserves GLB materials and supplies deterministic studio reflection.
- Low and normal quality policies are explicit.
- Geometry, NSS-V1 interfaces, assembly, and 288 combinations have zero drift.
- Historical Stage 8 evidence remains unchanged.

Phase 3C-A completion does not approve human visual quality and does not finalize the baseline. Human visual review remains pending until Phase 3C-H.
