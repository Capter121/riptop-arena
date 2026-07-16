# Phase 3B validation reporter compatibility diagnosis

Status: **Phase 3B changes requested**

## Reproduction

Command run from the project root:

```text
npm --prefix web-customizer run test:all
```

Observed result before any reporter implementation change:

- governance: PASS;
- unit tests: 95/95 PASS across 20 files;
- production build: PASS;
- Playwright: 18/18 PASS, skipped 0, unexpected 0, flaky 0;
- reporter: FAIL at `web-customizer/scripts/report-phase3a.mjs:38`.

The complete raw output is preserved in `reports/validation/phase3b-reporter-compatibility-reproduction.log`.

## Root cause

`test:all` still called the historical Phase 3A reporter. That reporter treated
`browser.stats.expected === 2` as the browser-suite contract. Phase 3B expanded the
same Playwright output to 18 tests, so a valid 18/18 report was rejected even though
all browser tests passed.

The old check also validated only aggregate counts. It did not prove that the
executed tests were the declared Phase 3A or Phase 3B tests, so changing the literal
from 2 to 18 would preserve the underlying completeness defect.

Root cause classification: stage configuration drift in validation infrastructure.
No product runtime, focus lifecycle, GLB, NSS-V1, mount, performance, or Playwright
assertion change is required.

## Repair contract

- Keep a versioned two-test Phase 3A manifest and an independent 18-test Phase 3B manifest.
- Identify tests by `project + relative file path + full title`.
- Require exact set equality: no missing, duplicate, undeclared, failed, skipped, flaky, or unexpected tests.
- Keep runtime technical-error counts at zero.
- Route current `test:all` through the explicit Phase 3B reporter.
- Keep the Phase 3A compatibility entry available without rewriting historical Phase 3A reports.

## Long-gate evidence recorded before repair

| Evidence | SHA-256 |
| --- | --- |
| `focus-batches/short-25-v2/summary.json` | `1f0a3a2b53de186253e0efb1b9117b3884a7b354efb3de38acfa1d9995bdc5fd` |
| `focus-batches/mobile-focus-01/summary.json` | `a3baf8a5fdb0062d5bffc162963561c471ad6b15ea01f1024b6d9dff6157608f` |
| `focus-batches/mobile-focus-02/summary.json` | `82bd867cdb0c0b79a054e7b309a37fb429d6f977fb703aa2bff22e0493b5466d` |
| `focus-batches/mobile-focus-03/summary.json` | `8326ee1de402369dae099052b377ad65a7c9838348442223024c67c597c3860b` |
| `focus-batches/mobile-focus-04/summary.json` | `2da7f47ada045d72fd9aa78edd696670a85eb9172760e6e661bd1b6a24edfa59` |
| `phase3b-mobile-focus-race-repeat100-final.log` | `696f36ad22d947b95438702b47522f7e69250a1a0f238addfc47cc4599fa3229` |
| `phase3b-original-mobile-repeat20.log` | `06b2a2ba5d3334f8a044113105f4d0e8758cff8c3db2dd4957f459b01b0ed941` |
| `phase3b-original-desktop-repeat20.log` | `7613b9d44b4349ea5a98c1ec5d91eba5d9ae09f9beac410ef79aeeec01148972` |
| `phase3b-desktop-focus-repeat20.log` | `b148b8cc9d98979233377fbf0160dcf054692b2481b6f20a1722d1eaeb7b9ff9` |
| `phase3b-full-playwright-after-focus-fix.log` | `5f8d57b392ff990969c43a8de29daa739f25736ad03ab6a57ca39cbae42d01cb` |
| `phase3b-performance-focus-gate-1.json` | `ca798782d699ef783a9984f67105d520fdb1df056677aafaca1072faa802c69a` |
| `phase3b-performance-focus-gate-2.json` | `a8f51764ff5d3516e19f86bfbe33376224438acad89458c9d4e7cbcf6a885fe9` |
| `phase3b-performance-focus-gate-3.json` | `9f00551ac8619e154f1b65df43c46e69a5249562989b4e7b9b9ec7dfe7588ca7` |

Paths in the table are relative to `reports/validation/`.

## Local repair verification

- reporter contract tests: 18/18 PASS;
- complete unit suite: 113/113 PASS across 21 files;
- TypeScript check: PASS;
- production build: PASS;
- current Phase 3B Playwright report: expected 18, discovered 18, passed 18;
- current Phase 3B missing, duplicate, undeclared, failed, skipped, unexpected, and flaky tests: 0;
- current Phase 3B console, page, failed-request, and external-request counts: 0;
- historical Phase 3A compatibility fixture: 2/2 PASS;
- historical Phase 3A report files changed: 0;
- product runtime and Playwright assertion files changed by this repair: 0.
