# Phase 3C Stage 6A — configuration-driven showcase MVP

Stage 6A adds a mobile-conscious product showcase without changing the formal GLBs, PBR materials, RoomEnvironment contract, or six identity layers.

## Baseline and boundary

The existing scene uses one perspective camera, `OrbitControls`, RoomEnvironment/PMREM, ACES Filmic tone mapping, sRGB output, and an assembled presentation root. The former continuous root rotation is removed: all rotation now comes only from the explicit Turntable policy.

## Showcase architecture

- `showcasePolicy.ts` owns the two delta-time turntable speeds.
- `showcaseCamera.ts` owns the four finite Hero, Top, Side, and Exploded preset values and 280–360 ms ease-out transitions.
- `studioLighting.ts` owns editing, LOW, MEDIUM, and HIGH Key/Fill/Rim data with shadows always disabled.
- `Scene.tsx` owns the existing camera, controls, scene groups, and one-time refs. It interpolates camera position and control target without per-frame allocation.

Showcase state is primitive-only: enabled flag, showcase camera preset, turntable enabled flag, speed, and an interaction-pause flag. It never stores a Three.js object. Enabling or disabling Showcase does not change the selected Core, Blade, Assist, Gear, Tip, identity toggles, or exploded state. Disabling Showcase forces Turntable off.

## Rendering policy

Showcase uses Key / Fill / Rim directional lights in addition to the preserved RoomEnvironment. LOW removes Rim and reduces light cost; MEDIUM provides the complete three-point arrangement; HIGH has a clearer but still restrained Rim. No profile enables shadows, post-processing, new meshes, textures, external requests, or a second camera.

The UI retains one viewer control area. Editing controls remain available outside Showcase; while Showcase is enabled, its four distinct presets and Turntable controls replace the duplicate editing camera choices. This keeps the mobile control surface compact.

## Performance contract

| Cost | Stage 6A delta |
| --- | ---: |
| Visible meshes | 0 |
| Textures / network requests | 0 / 0 |
| Model draw calls | 0 |
| Per-frame work | camera interpolation only while active; optional root rotation while enabled |

Turntable updates `rotation.y` by `angularSpeed * deltaSeconds`, pauses during OrbitControls interaction, and resumes only if still enabled after interaction ends. Existing exploded offsets and identity layers remain descendants of that root and therefore stay synchronized.
