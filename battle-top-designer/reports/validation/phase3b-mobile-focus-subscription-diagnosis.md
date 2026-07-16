# Phase 3B mobile focus subscription diagnosis

Status: root cause confirmed; repair verification in progress

## Scope

- Baseline HEAD: `6660a50240322df6aa94d1bc18b7b50b7976dfff`
- Primary evidence: mobile repeat 16 trace, screenshot, error context, focus diagnostics, store snapshot
- Frozen GLB, NSS-V1, mount transforms, Phase 2C evidence and freeze-check implementation were not modified.

## Repeat 16 timeline

| Trace time | Event | Evidence |
| ---: | --- | --- |
| 686955 | Navigation starts | Playwright action trace |
| 695401 | Guard click completes | Playwright action trace |
| 696762 | Guard readout assertion passes | Playwright assertion trace |
| 699496 | Air click completes | Playwright action trace |
| 703037.981 | Heavy click completes | Playwright action trace |
| 703041.143–703777.637 | Store snapshot evaluation | Snapshot reports `focus=assist`, `assist=assist_heavy`; DOM snapshots contain `Heavy Assist` in active and exiting phases |
| 703783.706 | Heavy readout locator assertion starts | Playwright assertion trace |
| 704013.652 | First recorded locator wait | The focus session has already reached idle and the readout is unmounted |
| 709035.960 | Assertion fails | `assist-focus-readout` not found |

Session 4 browser diagnostics independently record `entering` at 15209.7 ms, `active` at 15503.9 ms, `exiting` at 16575.1 ms, Scene restoration completion and store `idle` at 17046.6 ms, and the App idle commit at 17055.8 ms. The Heavy readout therefore rendered in the real DOM; the assertion began observing after an asynchronous snapshot consumed the remaining lifecycle window.

## Findings

1. No in-place focus object mutation was found. Existing valid transitions returned new objects, and no independent nested-field assignment exists under `web-customizer/src`.
2. Zustand did notify React. App committed session 4 entering, active and exiting states; Scene observed the same session; trace DOM snapshots prove the Heavy readout mounted.
3. App previously subscribed to the complete store while Scene selected `focusState`. This was observable but unnecessarily broad, and neither access path explained the failure.
4. `currentSnapshot.focus`, `focusPhase`, `focusSession` and `focusHighlight` are read-only compatibility projections from `focusState`; they have no writer, timer or action.
5. The direct assertion failure was an observation-order race: the test requested a snapshot before starting its required readout assertion.
6. A real lifecycle defect was also confirmed: the 800 ms highlight callback called `endFocusPulse`, which changed both `pulseActive` and `phase`. That coupled a visual pulse to session recovery and violated the approved invariant that the pulse controls only `pulseActive`.

## Repair

- Added a monotonic `revision` to the authoritative focus session.
- Routed semantic transitions through a pure reducer; every accepted event returns a new object and increments revision.
- Froze focus session objects in development and test builds.
- Split pulse end (`active`, `pulseActive=false`) from exit request (`active → exiting`).
- Kept painted-frame confirmation limited to `exiting → idle`.
- Changed the App readout subscription to explicit primitive fields.
- Added controlled diagnostics for object IDs, notification/render/read sequences, revision, predicate, mount state, part ID and combination ID.
- Kept the real readout assertions mandatory and moved them directly after the click, before diagnostic snapshot evaluation.

## Legacy-state audit

Search terms `focus`, `focusedLayer`, `activeFocus`, `focusTarget`, `focusPhase`, `focusPart`, `focusSession`, `showReadout`, `readoutVisible`, and `isFocusing` found one authoritative writable state: `focusState`. Other matches are presentation function parameters, CSS focus selectors, or read-only snapshot compatibility fields. No split writable focus state remains.

## Current verification

- Focus state-machine, lifecycle and real React/Zustand component tests: 33/33 PASS.
- TypeScript: PASS.
- Mobile repeat gates and full regression: pending.

The project status remains `Phase 3B changes requested` until every required mobile, browser, performance, governance and freeze gate passes.
