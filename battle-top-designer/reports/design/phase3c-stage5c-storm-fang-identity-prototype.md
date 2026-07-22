# Phase 3C Stage 5C — Storm Fang identity prototype

The prototype attaches three local annular sectors to the displayed `blade_storm_fang` group. Each sector occupies the 18–30 mm radial band, leaving the Core centre, outer attack edge, transparent component, and NSS-V1 collar unobscured. The sectors follow the three 120-degree blade directions and reuse the existing project-owned `storm-fang-concept.svg`.

All three meshes share one `TextureLoader` result and one `MeshBasicMaterial`. They inherit the Blade's assembly matrix, parent rotation, part-switch lifecycle, and exploded offset. The pattern is instantiated only when the active blade is Storm Fang and `stormFangPatternEnabled` is true. The independent `Storm pattern` control removes all sectors immediately when disabled.

The attachment is 3.62 mm above the Blade local origin, uses a narrow 0.48-radian sector span, `depthWrite=false`, and polygon offset. This avoids overlap with the Core and contact edge while mitigating z-fighting. It adds at most three draw calls, one SVG texture, and one material. React Three Fiber disposes the three geometries on unmount; the shared material is disposed in its effect cleanup; the loader-cached texture remains owned by the loader cache.

No GLB object, material, geometry, normal, UV, primitive, transform, or NSS-V1 record is changed. This remains a review-only prototype and requires human visual approval before any commit.
