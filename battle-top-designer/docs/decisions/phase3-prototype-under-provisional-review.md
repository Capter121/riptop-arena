# Phase 3 internal prototype under provisional visual review

- Decision date: 2026-07-15
- Decision owner: Nova Spin System project owner
- Decision status: Accepted for internal prototype planning
- Phase 2B status: **Phase 2B visual review deferred pending real reviewers**
- Phase 2C status: **Phase 2C technical validation PASS under provisional waiver**
- Technical baseline: `v0.2.0-rc1-technical-baseline` (`PROVISIONAL_NOT_FINAL`)

## Context

The 16 digital parts and all 288 legal combinations have passed the Phase 2C automated technical gate under the documented provisional exception. Three to five independent human reviewers are not currently available, so the Phase 2B visual-review requirement remains open.

The project owner authorizes continued internal prototype development without manufacturing new review evidence or treating the provisional exception as a substitute for independent visual judgment.

## Decision

1. Phase 2B independent human visual review remains pending.
2. Phase 2C technical validation has passed under the provisional exception.
3. Phase 3A may build an internal web-customizer prototype on `v0.2.0-rc1-technical-baseline`.
4. The provisional baseline must not be promoted to a final `v0.2.0` baseline during Phase 3A.
5. Project communication must keep the visual-review requirement open and must not represent it as completed.
6. Phase 3A provides no manufacturing, high-speed battle, material, or safety certification.
7. Three to five independent reviewers must complete the documented blind-review process before public release or a final baseline freeze.

## Architecture decision

Phase 3A will create a separate `web-customizer/` Vite application. The existing `preview/` remains an independent validation tool with its current offline Three.js dependencies and Playwright tests.

The new application will set Vite's `publicDir` to the existing `public/models/parts` directory instead of copying the 16 GLBs into a second source directory. Its generated distribution may package one hash-identical copy of each part as a build artifact, but no duplicate model is checked into `web-customizer/`. React, TypeScript, React Three Fiber, Three.js, Zustand, and test dependencies will be installed with exact versions and a committed lockfile. Runtime network access is forbidden.

This separation was selected over two alternatives:

- Migrating `preview/` in place would reduce initial files but risks breaking approved Phase 2A/2B browser evidence.
- Extending the existing vanilla script into a full customizer would preserve its stack but produce tightly coupled scene, state, animation, and UI code.

The parallel application has a small setup cost but gives the internal prototype an isolated lifecycle and preserves all historical browser regressions.

## Frozen boundaries

Phase 3A must not modify:

- visible geometry of the 16 parts;
- interface parameters in the 16 part specifications;
- `specs/interfaces.json` or NSS-V1;
- `docs/baselines/v0.2.0-rc1-technical-baseline.json`;
- Phase 2C result artifacts.

If the customizer exposes a model problem, the implementation records an issue with the part ID, combination ID, view, reproduction steps, and screenshot. It does not silently repair geometry or widen validation tolerances.

## Required report notice

Every Phase 3 report must include:

> Human visual review remains pending.
> Development continued under a documented provisional internal-prototype decision.

## Release limitation

Phase 3A is an internal digital product prototype. It does not authorize public release, final baseline promotion, physical manufacturing, high-speed battle use, or safety and material claims.
