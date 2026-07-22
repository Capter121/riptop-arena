# Phase 3C Stage 5B — Solar Wolf badge prototype

The prototype attaches the existing project-owned `solar-wolf-concept.svg` as a R3F child of the displayed `core_solar_wolf` group. Its 7.6 mm radius is inside the 8 mm approved safe zone. The local Y offset is 0.16 mm above the Core top surface; `depthWrite` is disabled and polygon offset is enabled to prevent visible z-fighting.

The child inherits the Core's permanent assembly matrix, animated explosion/focus offset, and the parent rotating group. It is only instantiated for `core_solar_wolf` while `solarWolfBadgeEnabled` is true. The `Solar badge` viewport control disables it immediately; selecting Void Falcon removes it.

The GLB is unchanged: no material is replaced or traversed, and no GLB geometry, primitive, UV, normal, or NSS-V1 record changes. Budget: one extra draw call and one SVG texture only when visible. The SVG has a 1024 px source and remains legible at mobile scale; low-performance mode does not change its readability, but the control allows removal at any time.

This is a human-review prototype only. It must not be committed or promoted to a product asset without visual approval.
