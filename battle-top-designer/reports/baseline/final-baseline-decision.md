# Final Baseline Decision

## Decision

`FINAL_BASELINE_DECISION: APPROVED_WITH_POST_STAGE8_VISUAL_DELTA_ACCEPTANCE`

| Item | Value |
| --- | --- |
| Final baseline HEAD | `94dcdb931fa3f3ab21c1b163509d92a65c23f061` |
| Formal Stage 8 evidence HEAD | `12bd89d9fa21098e30d78c46ea9a02261c973aac` |
| Formal Stage 8 run | `stage8-delivery-20260720T152216Z-12bd89d` |
| Formal Stage 8 status | `PASS` |
| Phase 3C | `COMPLETE` |
| Human visual review | `APPROVED` |
| Post-Stage 8 delta | `ACCEPTED_WITHOUT_FULL_STAGE8_RERUN` |
| Final baseline | `APPROVED` |

The formal Stage 8 run passed preflight, long, and finalize on its own evidence HEAD. This decision does not claim `CURRENT_HEAD_FORMAL_STAGE8_PASS`.

## Post-Stage 8 delta audit

The range `12bd89d..94dcdb9` contains the approved Phase 3C visual-production history:

1. Deterministic Blender PBR profiles and all 16 formal GLB material updates.
2. Deterministic normal-buffer repair and its validation.
3. Local studio environment, RoomEnvironment/PMREM, and color-management presentation work.
4. Rendering quality policy.
5. Six local, original identity SVG/PNG concept assets.
6. Six optional runtime identity layers and their unit coverage.
7. Studio key/fill/rim Showcase lighting.
8. Four shared Showcase camera presets.
9. Optional, user-yielding Showcase turntable behavior.
10. Final control grouping and mobile presentation polish.
11. Design, validation, and human-review reports for the above work.

No material delta was found in gameplay, NSS-V1, collision, combination rules, physics, networking, persistence, export contracts, the Stage 8 runner, or formal Playwright parameters. Historical Stage 8 artifacts were not changed. The formal GLBs are now frozen and their current integrity check covers all 16 files.

## Evidence accepted

- Phase 2C technical validation: `PASS`.
- Phase 3B formal Stage 8: `PASS` at `12bd89d` with zero artifact-hash mismatches.
- Current visual delta: Showcase/identity unit tests `21/21 PASS`; all units `275/275 PASS`; TypeScript, catalog, production build, SVG integrity, formal GLB integrity, and `git diff --check` all `PASS`.
- Phase 3C human visual review: `APPROVED`.

## Residual risk

`RESIDUAL_RISK: ACCEPTED_LOW_VISUAL_INTEGRATION_RISK`

The final baseline HEAD did not receive another complete Playwright Stage 8 execution. This is accepted because the post-Stage 8 changes were scope-audited visual and presentation work, received focused and full unit/build validation, preserved formal GLB and historical evidence integrity, and were approved by human visual review. A full Stage 8 rerun is not required for this baseline decision.
