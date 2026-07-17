# Phase 3B Stage 7 Tip Readout Observation Diagnosis

Status: `OBSERVATION_ORDERING_RACE_CONFIRMED`

Source trace: `web-customizer/test-results/anonymous-test-mode-comple-d5b2c-xports-a-whitelisted-result-stage7-mobile/trace.zip`
Source trace SHA-256: `d27fb0bdce9750b9b8f5b4c14f990f33000358942fef3994ddef752d20363e65`

All timestamps below use the trace monotonic clock in milliseconds. Snapshot wall-clock values are included where the trace recorded them directly. A frame snapshot proves the DOM state at its timestamp; it does not expose the exact React mutation instant between two snapshots.

## Timeline

| Event | Trace time (ms) | Snapshot wall time (Unix ms) | Evidence |
|---|---:|---:|---|
| Playwright starts the `tip_flat_attack` click command | 282903.499 | — | `test.trace`, `pw:api@70` before |
| Browser performs the click | 285269.772–285768.727 | — | `0-trace.trace`, `call@149` action logs |
| Browser click call completes | 286095.262 | — | `0-trace.trace`, `call@149` after |
| Readout is first captured in the DOM | 286398.595 | 1784206602222 | `after@call@149`: `data-testid="tip-contact-readout"` |
| Captured readout text | 286398.595 | 1784206602222 | `Contact focus · Flat Attack Tip` |
| Task 4 progress is first captured as `1/4` | 286398.595 | 1784206602222 | Same `after@call@149` snapshot |
| Playwright click step completes | 286399.067 | — | `test.trace`, `pw:api@70` after |
| Model-ready assertion starts | 286401.007 | — | `test.trace`, `expect@71` before |
| Browser confirms model ready | 286975.797 | — | `0-trace.trace`, `call@151` after |
| Last snapshot containing the readout | 287280.029 | 1784206603103 | `after@call@151`; phase is `exiting`, model is ready |
| Model-ready assertion step completes | 287280.430 | — | `test.trace`, `expect@71` after |
| Readout visibility assertion is scheduled | 287281.900 | — | `test.trace`, `expect@72` before |
| Browser-side visibility call starts | 287283.131 | — | `0-trace.trace`, `call@153` before |
| First snapshot proving the readout is absent | 287595.433 | 1784206603419 | `before@call@153`; no `tip-contact-readout` node |
| Locator begins polling for the readout | 287595.985 | — | `call@153`: `waiting for getByTestId('tip-contact-readout')` |
| Browser-side locator wait ends | 292610.293 | — | `0-trace.trace`, `call@153` after |
| Test assertion reports timeout | 292770.136 | — | `test.trace`, `expect@72` after |

The readout entered the DOM after the physical click completed and was captured with correct content. The trace does not record the exact mutation instant; it bounds entry to `285768.727 < entry <= 286398.595`. It remained captured through `287280.029` and was removed in `287280.029 < exit <= 287595.433`. Browser polling began at `287595.985`, at least `0.552 ms` after the first snapshot proving removal.

## Findings

- **Did the readout really appear?** Yes. The post-click snapshot contains `tip-contact-readout` with `Contact focus · Flat Attack Tip`.
- **Did polling begin after removal?** Yes. The last captured readout is in `exiting` at `287280.029`; it is absent at `287595.433`; polling begins at `287595.985`.
- **Was the content wrong?** No. The text matches the selected Flat Attack Tip.
- **Did task progress agree with the readout commit?** Yes. The first snapshot containing the readout also records Task 4 as `1/4`.
- **Is there evidence of a product runtime failure?** No. The selected part, bottom camera, readout text, task progress, and ready state are mutually consistent. The failure is the sequential test observation order: click → ready wait → readout wait.

## Approved repair direction

The Stage 7 test must create an exact readout locator and start its visibility/text observation before clicking the part option. The click and readout observation must then run concurrently. Only after both succeed may the test wait for model ready and verify task progress, selected part, and combination ID. No product runtime code, duration, retry, fixed sleep, or assertion timeout needs to change.
