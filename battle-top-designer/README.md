# Nova Spin System

Nova Spin System is a JSON-driven Blender pipeline for generating original modular battle-top parts using the NSS-V1 concept interface.

The current implementation scope is the vertical slice defined in `docs/implementation-plan.md`: one representative main blade (`blade_storm_fang`) and one complete assembly (`assembly_storm_attack`). The full 16-part, four-assembly MVP is intentionally deferred until the vertical slice passes geometry, assembly, glTF, and visual review.

Reference images are research-only and must never be copied into geometry, names, logos, materials, textures, exact silhouettes, palettes, or mechanical interfaces.

Planned entry points:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_all.ps1 -Scope VerticalSlice
powershell -ExecutionPolicy Bypass -File scripts/test_all.ps1 -Scope VerticalSlice
```

These commands are not considered available until their implementation step has passed validation.
