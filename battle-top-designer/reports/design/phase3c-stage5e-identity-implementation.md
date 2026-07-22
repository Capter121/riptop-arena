# Phase 3C Stage 5E — remaining visual identity implementation

Stage 5E implements the four Stage 5D-approved runtime identity layers without mutating a formal GLB, its geometry, or its source material.

## Registry and renderer boundary

`web-customizer/src/rendering/visualIdentityRegistry.ts` is immutable configuration only. It records all six identity IDs, their part bindings, local SVG source paths, independent toggle key, approved radial range, offset, renderer type, and mesh/draw-call budgets. It intentionally holds no Three.js runtime object.

The existing Solar Wolf and Storm Fang render paths remain visually unchanged. New layers use the approved renderer classes:

| Identity | Renderer | Meshes / draw calls | Texture / material |
| --- | --- | ---: | ---: |
| Void Falcon | Core badge | 1 / 1 | 1 / 1 |
| Iron Bastion | Blade sectors | 3 / 3 | 1 shared / 1 shared |
| Orbit Halo | Blade ring | 1 / 1 | 1 / 1 |
| Dual Comet | Blade sectors | 3 / 3 | 1 shared / 1 shared |

Core and Blade layers mount below their respective `PresentationPart` group. They therefore inherit its permanent assembly matrix, rotation, and exploded offset, and unmount whenever the selected part or that identity's own toggle no longer qualifies.

## Resource and depth policy

Each SVG is a local source loaded through the existing `TextureLoader` cache only when its layer mounts. Blade renderers create one local `MeshBasicMaterial` shared by their meshes and dispose it on unmount; loader-cache ownership keeps the texture reusable. No mesh, geometry, material, or texture is recreated per frame or rotation.

All overlays use transparent alpha-tested material, `depthWrite=false`, normal depth testing, and a minimal polygon offset. The surface radii and offsets come from the approved Stage 5D audit. Existing Solar Wolf and Storm Fang output was not altered.

The worst valid selection is one Core badge plus a three-sector Blade identity: **4 visible identity draw calls**, 2 SVG textures, 2 materials, and 4 meshes. This meets `MAX_VISIBLE_IDENTITY_DRAW_CALLS=4`.

## Verification boundary

The work passed focused and full unit tests, TypeScript, product-catalog verification, production build, SVG XML/local-dependency checks, formal 16-GLB byte comparison, and whitespace validation. No Playwright, Chromium, Stage 8, or GLB generation was run.

Human review remains required for Void Falcon + Iron Bastion, Void Falcon + Orbit Halo, Solar Wolf + Dual Comet, and Solar Wolf + Storm Fang.
