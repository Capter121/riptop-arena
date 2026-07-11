# Spin Speed and Absolute Zero Performance Fix

## Goal

Make top rotation visually fast and consistent across frame rates, and prevent the Absolute Zero Hologrid arena from accumulating expensive mirror resources across repeated theme selection and battle starts.

The fix must preserve the real-time mirror identity of the Absolute Zero arena while reducing its GPU cost. It must not change combat `spin`, stamina drain, collision physics, or battle balance.

## Confirmed Root Causes

### Frame-dependent visual rotation

`TopEntity.syncMesh()` currently adds a fixed rotation delta once per rendered frame:

```text
baseRotDelta = spinRatio * 0.62 * energyBoost
```

Because elapsed time is absent, visual rotations per second fall in direct proportion to FPS. A scene running at 30 FPS displays approximately half the angular speed of the same top at 60 FPS even though its combat `spin` value is unchanged.

### Repeated Absolute Zero initialization

`ArenaVisuals.initAbsoluteZero()` creates a reflector, grid, and 36 ice peaks every time it is called. Theme selection and battle start can call `setTheme('absolute_zero')` consecutively, so the same arena resources are appended more than once.

Only the most recently created objects are retained in the cleanup fields. Earlier objects remain in the visual root and their GPU resources are not fully released.

### Oversized mirror render target

The reflector render target uses the full viewport multiplied by device pixel ratio. On a 1920x1080 DPR 2 display this can approach 3840x2160, in addition to the main renderer and post-processing targets.

## Baseline Evidence

Production preview measurements at 1280x720 and DPR 2 showed the following relative degradation in the headless GPU environment:

| Scenario | Frame time | Geometries | Textures |
| --- | ---: | ---: | ---: |
| Classic Grid | 1619 ms | 42 | 38 |
| First Absolute Zero initialization | 4743 ms | 46 | 41 |
| Second Absolute Zero initialization | 8159 ms | 49 | 43 |
| Classic after leaving Absolute Zero | 1559 ms | 46 | 42 |

The absolute frame rates are specific to software-rendered browser automation, but the ratios and monotonically increasing resource counts confirm the two root causes.

## Design

### Time-based visual spin

Extend `TopEntity.syncMesh()` with an elapsed-time argument in seconds. Compute visual angular displacement as angular velocity multiplied by elapsed time.

The 60 FPS appearance remains the reference speed:

```text
referenceRadiansPerSecond = 0.62 * 60
baseRotDelta = spinRatio * referenceRadiansPerSecond * dt * energyBoost
```

Use real render delta during normal play so visual spin remains stable across frame rates. Pass zero while paused and for one-off position synchronization so menus, pause screens, and substitutions do not advance rotation accidentally.

Clamp the visual delta to a small maximum, such as 1/20 second, to prevent a background-tab wakeup from producing a large single-frame angle jump.

This changes presentation only. Physics and combat continue using the existing `spin` value and simulation timestep.

### Idempotent Absolute Zero lifecycle

Make `ArenaVisuals.initAbsoluteZero(parent)` return immediately when the visual set is already active under the requested parent.

On removal:

- remove the visual root from its parent,
- dispose the reflector and its render target,
- dispose grid geometry and material,
- dispose shared ice geometry and material once,
- clear every child and object reference,
- reset transient animation state.

Repeated calls must leave object counts unchanged. A later remove-and-reinitialize cycle must create exactly one visual set.

### Bounded mirror quality

Keep the real `Reflector`, but size its render target independently of raw device DPR.

- Desktop maximum: 1024 pixels on either dimension.
- Small/coarse-pointer devices: retain the existing non-reflective metallic fallback.
- Preserve viewport aspect ratio when applying the cap.
- Do not allocate a new mirror target when the current Absolute Zero visuals are already active.

This keeps the arena recognizably mirrored while preventing high-DPR displays from multiplying GPU fragment cost.

### Theme-owned background cleanup

Track the background texture created by `ArenaScene.setTheme()`. Before replacing it, pause and release the previous video and dispose the previous theme-owned texture.

The default PMREM environment remains owned by `Game` and must not be disposed by theme switching.

## Files

- `src/gameplay/top.ts`: frame-rate-independent visual rotation.
- `src/app/game.ts`: pass the correct elapsed time to visual synchronization and expose player/enemy visual rotation angles in QA diagnostics.
- `src/scene/arenaVisuals.ts`: idempotent initialization, capped reflector resolution, complete disposal.
- `src/scene/arena.ts`: background video/texture ownership and cleanup.

No combat stat, damage, item, HUD, or physics formula changes are required.

## Error Handling

- Treat invalid or negative `dt` as zero.
- Clamp abnormally large `dt` before visual angle integration.
- If the reflector cannot be created, retain the metallic fallback rather than failing arena setup.
- Cleanup methods must be safe when called before initialization or more than once.
- Theme switching must not dispose the shared default environment texture.

## Verification

### Automated checks

- Run `npm run build`.
- Run `git diff --check`.
- Use production preview, not only the Vite development server.

### Browser regression scenarios

1. Measure Classic Grid at DPR 1 and DPR 2.
2. Switch to Absolute Zero once and record FPS/frame time and renderer memory counts.
3. Select Absolute Zero again and confirm geometries/textures do not increase.
4. Switch back to Classic Grid and confirm Absolute Zero-owned resources return to the pre-switch baseline.
5. Compare visual angular displacement over the same wall-clock interval at different effective frame rates; the per-second rotation must remain within 10 percent.
6. Verify pause freezes visual rotation and resume does not jump.
7. Verify both tops remain visually fast at full `spin` without changing their combat spin values.
8. Capture desktop and mobile screenshots and check for console/page errors.

## Success Criteria

- Visual top rotation differs by no more than 10 percent per wall-clock second between healthy and reduced-FPS scenarios.
- A repeated `absolute_zero` initialization does not increase geometry or texture counts.
- Returning to Classic does not retain Absolute Zero reflector targets or visual geometry.
- Absolute Zero remains mirrored on capable desktop devices and uses the fallback on constrained/mobile devices.
- Build and existing battle flow remain functional.
