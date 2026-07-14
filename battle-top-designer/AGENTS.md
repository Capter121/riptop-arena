# Nova Spin System Agent Rules

- Follow `docs/nova-spin-system-mvp-design.md` and `docs/implementation-plan.md` in that order.
- Do not batch-delete files or directories. Never add a cleanup script that recursively removes outputs.
- Preserve unrelated workspace changes and stage only files created for this project.
- Keep all part-specific geometry parameters in JSON under `specs/`; Blender code may contain only generic algorithms and validation limits.
- Do not import reference images, names, logos, badges, textures, exact outlines, palettes, or interfaces into generated assets.
- Stop on validation failure. Do not mark a phase complete unless its documented commands were actually run successfully.
- Use millimeters in specs and convert to meters only at the Blender API boundary.
- Keep generation deterministic; any random seed must come from the part JSON.
