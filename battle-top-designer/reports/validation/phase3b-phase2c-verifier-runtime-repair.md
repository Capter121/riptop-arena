# Phase 3B Phase 2C verifier runtime repair

Status: **VERIFIER_RUNTIME_REPAIR_PASS**

Phase state remains:

- `Phase 3B changes requested`
- `Stage 7 blocked`
- `Stage 8 not allowed`

> Human visual review remains pending. Technical continuation was authorized by documented provisional exception, not by fabricated review data.

## Root cause and repair

The previous evidence-freeze entry launched the baseline verifier with a bare `python` command and reduced the process outcome to `status === 0`. A launch failure such as `EPERM` therefore became `baselineAssetsValid=false`, which was always reported as `PROVISIONAL_BASELINE_ASSET_DRIFT`.

The repair now:

1. Resolves Python deterministically without `shell:true`.
2. Gives `NSS_PYTHON_EXECUTABLE` highest priority and does not silently fall back when it is invalid.
3. Probes fixed platform candidates with `--version` and requires Python 3.
4. Keeps executable and argument arrays separate, including `py` plus `-3`.
5. Preserves status, signal, spawn error code, verifier exit code, stdout summary, and stderr summary.
6. Parses a structured verifier result before classifying asset drift.
7. Redacts configured absolute paths from machine output.

Stable classifications:

| Condition | Error code |
| --- | --- |
| No candidate Python 3 runtime | `PYTHON_RUNTIME_NOT_FOUND` |
| Selected runtime cannot launch, including `EPERM`, `ENOENT`, or `status=null` | `PYTHON_RUNTIME_LAUNCH_FAILED` |
| Runtime starts but verifier crashes, is signalled, exits inconsistently, or emits invalid output | `PYTHON_VERIFIER_EXECUTION_FAILED` |
| Structured verifier result names real mismatched assets | `PROVISIONAL_BASELINE_ASSET_DRIFT` |
| Structured result reports all 50 assets matched | `PROVISIONAL_BASELINE_VERIFY_PASS` |

## Test evidence

The first regression test was run against the old implementation and failed as intended:

```text
expected [ 'PROVISIONAL_BASELINE_ASSET_DRIFT' ]
to include 'PYTHON_RUNTIME_LAUNCH_FAILED'
```

After the repair:

| Gate | Result |
| --- | --- |
| Focused evidence-freeze and runtime tests | 35/35 PASS |
| New runtime/error-classification tests | 25/25 PASS |
| Full Web Customizer unit suite | 197/197 PASS |
| Node syntax | PASS |
| Python AST syntax | PASS |
| Web Customizer TypeScript | PASS |

The tests cover explicit runtime selection, paths with spaces, unavailable paths, deterministic probe order, `py -3`, `shell:false`, path redaction, `EPERM`, `ENOENT`, `status=null`, signals, nonzero exits, empty or invalid output, schema errors, successful stderr preservation, real drift, 50/50 success, temporary-file byte drift, runtime exceptions, and frozen manifest scope.

## Formal evidence-freeze result

Command:

```text
npm --prefix web-customizer run check:phase2c-evidence-freeze
```

The PowerShell execution used the approved bundled runtime through `NSS_PYTHON_EXECUTABLE`. No absolute runtime path is stored in versioned output.

| Field | Result |
| --- | --- |
| Overall | PASS |
| Runtime resolution | `NSS_PYTHON_EXECUTABLE` |
| Version | Python 3.12.13 |
| Reported executable | `<configured-python>/python.exe` |
| Spawn status / signal / error | `0` / `null` / `null` |
| Verifier exit code | 0 |
| Asset count | 50 |
| Matched / drifted / missing / extra | 50 / 0 / 0 / 0 |
| Phase 2C evidence | PASS |
| Protected worktree | PASS |
| Reports unchanged since evidence commit | true |
| Reports clean in worktree / index | true / true |
| Baseline status | `PROVISIONAL_NOT_FINAL` |

## Frozen evidence

| Evidence | Result |
| --- | --- |
| 16 GLB SHA-256 values | unchanged |
| NSS-V1 SHA-256 | unchanged (`5744cca158ed260cb4d5c46b57a5f4c306628ca5f932cb3f60347454caaa6e12`) |
| 16 mount semantic fingerprints | unchanged |
| 16 part specifications | unchanged |
| Waiver | unchanged |
| Baseline manifest | unchanged (`647502dbb852ed4c8387619973e5ac1e23d13117572eb42fa840cb26ed1add55`) |
| Phase 2C final gate | unchanged (`7887a62f74df180ce8235dc47b7f075c270f185ca8db3b9b13f4093036e7b8f2`) |
| Phase 2C combination matrix | unchanged (`ad1bf0235f9b65c31c3aae1bc158b8a368004a5520e225658d745c64458f38c9`) |
| 288 combination IDs and order | unchanged; 0 duplicate, 0 missing |

Baseline identity:

- Tag: `v0.2.0-rc1-technical-baseline`
- Tag object: `4a7a6895d5d3bb6608a4178d8f9d8373f8e3a07f`
- Resolved commit: `5951ecab40eb4d58ef502fded23b13fa04292429`

No GLB, NSS-V1, mount data, part specification, waiver, baseline manifest, Phase 2C final report, combination matrix, hash algorithm, tolerance, asset path set, or product runtime code was modified.

Stage 7 remains blocked until this independent infrastructure commit passes all post-commit gates.
