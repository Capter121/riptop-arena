# Phase 3C Stage 5A — Solar Wolf + Storm Fang visual identity

## Scope and freeze

This is a review-only identity prototype. The GLB geometry contract remains frozen: no POSITION, index, transform, primitive, material-slot, normal, NSS-V1, collision, or combination-system changes are proposed. The two SVGs are original, editable, transparent-background concept assets; the PNGs are deterministic review previews, not product catalog assets.

## Solar Wolf

The top-view mark uses a circular solar halo with five structural rays and a mechanical wolf face. Gold (`#F6B83B`) carries the solar identity, warm white (`#FFF1B0`) is a narrow highlight, crimson (`#D81F35`) is reserved for the two eye slits, and gunmetal (`#1A2129`) preserves engineering structure. The emblem has a 22% radial safe zone at centre and a 10% clear outer margin, so it remains readable at a 64 px mobile thumbnail.

Future identifier placement: `NSS-C01` follows the lower-left rim and `SOLAR WOLF` follows the lower-right rim. Use a system geometric sans or outlined paths in a final deliverable; this prototype intentionally contains no font dependency.

## Storm Fang

The blade graphic is a three-direction, clockwise storm motif: broad storm-blue sweeps (`#1676BE`) carry form, silver-white (`#E7FBFF`) is a thin high-speed edge, and electric cyan (`#4EE3F2`) marks the cutting direction. The centre is deliberately clear for the Core and no large wordmark crosses metallic highlight surfaces. The three wedges are legible from 64 px; secondary six-segment ticks may be introduced only after a physical placement proof.

Future identifier placement: `NSS-B01` and `STORM FANG` sit on the inner lower arc, never on the outer contact edge.

## Decal route decision

| Route | Stage 5A decision | Why |
| --- | --- | --- |
| A. Blender geometry decal | Not selected | Adds primitives/geometry and risks z-fighting; violates the frozen geometry contract. |
| B. Web `DecalGeometry` | Not selected | Adds draw calls and attachment/z-fighting risk during exploded views; cannot be exported in the authoritative GLB. |
| C. Canvas/DynamicTexture | Not selected | Requires local material replacement and weakens GLB-material authority. |
| D. UV + texture | Deferred | Correct long-term commercial route, but requires `TEXCOORD_0`, baseline renewal, and asset re-export. |
| E. Thin SVG/PNG Core badge | Recommended candidate | Small, isolated, deterministic, no GLB mutation; must be proven as an optional attachment layer before product use. |

The recommended next implementation is a single optional Core badge attachment for `core_solar_wolf`, built from the reviewed SVG and constrained to its own render layer. It must not change GLB primitives or materials. Storm Fang remains a concept until an explicit attachment/placement approval establishes whether its directional pattern can be a separate layer without obscuring functional surfaces.

## Asset specification and review

- Source: project-owned SVG, `1024 × 1024`, transparent background, sRGB, geometry/path primitives only.
- Preview: project-owned PNG, `1024 × 1024`, intended solely for design review.
- No external artwork, fonts, CDN, textures, or trademarked toy/anime marks are used.
- Mobile cost for the concepts is zero because they are not loaded by the product. A future single badge layer should budget one additional draw call and no more than a 256 px rasterization target.

Human review should approve: (1) Solar Wolf silhouette and red-eye restraint, (2) Storm Fang clockwise direction, (3) colour hierarchy under the existing Stage 4A environment, and (4) whether to authorize the isolated Core badge prototype. Approval is required before any official runtime or GLB file changes.
