# Phase 3C Stage 5D — remaining identity expansion plan

This review package plans four remaining identities only. It changes no Web product code or formal GLB asset. All concept SVGs are original, editable, `1024 × 1024`, transparent-background, sRGB vector assets without external artwork, fonts, or network resources.

## Identity directions

| Identity | Direction | Palette | Future layer |
| --- | --- | --- | --- |
| Void Falcon | Mechanical falcon diving through a broken void ring | void black, deep violet, electric indigo, cold cyan | one Core badge |
| Iron Bastion | Three armored shield facets and restrained amber defence markers | gunmetal, armor silver, warning amber, black steel | three Blade sectors |
| Orbit Halo | clean orbital arcs, energy nodes and balanced symmetry | pearl white, pale gold, soft cyan, graphite | one annular Blade layer |
| Dual Comet | alternating orange and ice-blue twin tails in a three-unit repeat | comet orange, ice blue, bright white, deep navy | three Blade sectors |

## Stage 5E architecture

Add a small `visualIdentityRegistry` only for shared policy data: part ID, independent enabled state, local SVG path, draw-call budget, radial range, height offset, sector rotations, and material policy. Retain separate renderers for Core badges and Blade sectors. This avoids four copy-pasted policy modules without forcing fundamentally different Core and Blade geometry into one abstraction.

Do not add a general lifecycle utility yet. `TextureLoader` cache ownership and renderer-local material disposal have already proven sufficient; a shared helper would be justified only if Stage 5E repeats the same cleanup sequence in more than two new renderers.

## Stage 5E expected files

- `web-customizer/src/rendering/visualIdentityRegistry.ts`
- Core badge renderer/policy extension for `core_void_falcon`
- Blade sector renderer/policy extension for Iron Bastion, Orbit Halo, and Dual Comet
- `web-customizer/src/Scene.tsx`, `store.ts`, `App.tsx`
- focused identity registry and renderer unit tests

Formal GLBs, material slots, UVs, normals, NSS-V1, assembly rules, Stage 4 environment, and Stage 8 history remain outside scope. Human review must approve all four concepts before Stage 5E begins.
