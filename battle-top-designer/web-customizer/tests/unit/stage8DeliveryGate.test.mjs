import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertStage8PythonRuntimeReady,
  assertStage8PythonRuntimeStable,
  assertStage8Summary,
  classifyStage8MachineOutput,
  completeStage8Mode,
  createStage8Run,
  finalizeStage8Failure,
  inspectBuildOutput,
  parsePlaywrightReport,
  redactStage8PythonRuntimeIdentity,
  runStage8MachineCommand,
  snapshotFiles,
  STAGE8_MACHINE_JSON_COMMANDS,
  stage8MachineJsonCommand,
  stage8PythonRuntimeIdentity,
  stage8RunId,
  validateGovernance,
  validatePhase2cEvidenceFreeze,
  validateStage7Evidence,
} from '../../scripts/stage8-delivery.mjs';

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'nss-stage8-'));
}

function writeModeSummary(run, mode) {
  writeFileSync(join(run.runDir, `${mode === 'long' ? 'long-gates' : mode}-summary.json`),
    `${JSON.stringify({ status: 'PASS', completedAt: '2026-07-18T00:00:00.000Z' })}\n`);
}

function phase2cPayload() {
  return {
    result: 'PASS',
    gates: {
      provisional_baseline_assets: {
        result: 'PASS',
        assetCount: 50,
        matched: 50,
        drifted: 0,
        missing: 0,
        extra: 0,
      },
    },
  };
}

function stage7EvidencePayload() {
  return {
    result: 'PASS',
    originalFailureJsonSha256: 'a'.repeat(64),
    preservedEntries: 19,
    unavailableEntries: 3,
    currentRevalidationEntries: 3,
  };
}

function governancePayload() {
  return {
    result: 'PASS',
    waiver_sha256: 'b'.repeat(64),
    expires_on: '2026-08-14',
    baseline_status: 'PROVISIONAL_NOT_FINAL',
    errors: [],
  };
}

function pythonResolution(overrides = {}) {
  const { runtime: runtimeOverrides = {}, ...resolutionOverrides } = overrides;
  const runtime = {
    executable: 'configured-python',
    prefixArgs: [],
    source: 'NSS_PYTHON_EXECUTABLE',
    configured: true,
    version: 'Python 3.11.9',
    ...runtimeOverrides,
  };
  return {
    result: 'PASS',
    runtime,
    attempts: [{ source: runtime.source, status: 0, errorCode: null, version: runtime.version }],
    ...resolutionOverrides,
  };
}

describe('Stage 8 machine JSON', () => {
  it('accepts one valid JSON object and preserves stderr', () => {
    const result = classifyStage8MachineOutput({ status: 0, signal: null,
      stdout: `${JSON.stringify(phase2cPayload())}\n`, stderr: 'diagnostic\n' }, validatePhase2cEvidenceFreeze);
    expect(result).toMatchObject({ result: 'PASS', errorCode: null, payload: phase2cPayload(),
      process: { status: 0, stderr: 'diagnostic\n' } });
  });

  it.each([
    [`> npm run check:phase2c-evidence-freeze\n${JSON.stringify(phase2cPayload())}`, 'npm prefix'],
    [`${JSON.stringify(phase2cPayload())}\nextra`, 'trailing text'],
    ['', 'empty output'],
    ['not-json', 'invalid JSON'],
  ])('rejects %s as invalid machine output', (stdout) => {
    expect(classifyStage8MachineOutput({ status: 0, stdout, stderr: '' }, validatePhase2cEvidenceFreeze).errorCode)
      .toBe('STAGE8_MACHINE_OUTPUT_INVALID');
  });

  it('rejects a nonzero exit before considering a PASS payload', () => {
    expect(classifyStage8MachineOutput({ status: 1, stdout: JSON.stringify(phase2cPayload()), stderr: '' },
      validatePhase2cEvidenceFreeze).errorCode).toBe('STAGE8_COMMAND_EXECUTION_FAILED');
  });

  it('classifies status null with EPERM as a launch failure', () => {
    expect(classifyStage8MachineOutput({ status: null, stdout: '', stderr: '', error: { code: 'EPERM' } },
      validatePhase2cEvidenceFreeze).errorCode).toBe('STAGE8_COMMAND_LAUNCH_FAILED');
  });

  it('rejects missing Phase 2C fields as a schema failure', () => {
    expect(classifyStage8MachineOutput({ status: 0, stdout: '{"result":"PASS"}', stderr: '' },
      validatePhase2cEvidenceFreeze).errorCode).toBe('STAGE8_MACHINE_OUTPUT_SCHEMA_INVALID');
  });

  it('uses the direct Node entry, explicit cwd, and shell false', () => {
    const calls = [];
    const result = runStage8MachineCommand({
      executable: 'node',
      args: ['scripts/check-phase2c-evidence-freeze.mjs'],
      cwd: 'web-customizer',
      validate: validatePhase2cEvidenceFreeze,
      spawn: (...args) => {
        calls.push(args);
        return { status: 0, stdout: JSON.stringify(phase2cPayload()), stderr: '' };
      },
    });
    expect(result.result).toBe('PASS');
    expect(calls).toEqual([['node', ['scripts/check-phase2c-evidence-freeze.mjs'], {
      cwd: 'web-customizer', encoding: 'utf8', windowsHide: true, shell: false,
    }]]);
  });
});

describe('Stage 8 registered machine JSON invocations', () => {
  it('registers only the existing direct Node validator entries', () => {
    expect(STAGE8_MACHINE_JSON_COMMANDS).toEqual({
      phase2cEvidenceFreeze: {
        gateName: 'phase2c-evidence-freeze', args: ['scripts/check-phase2c-evidence-freeze.mjs'],
      },
      stage7Evidence: {
        gateName: 'stage7-evidence', args: ['scripts/validate-stage7-evidence.mjs'],
      },
      governance: {
        gateName: 'governance', args: ['scripts/check-governance.mjs'],
      },
    });
    expect(JSON.stringify(STAGE8_MACHINE_JSON_COMMANDS)).not.toMatch(/npm(?:\.cmd)?|npm run/i);
  });

  it('runs stage7-evidence with the direct Node entry, cwd, and shell false', () => {
    const command = stage8MachineJsonCommand('stage7Evidence', 'node-executable');
    const calls = [];
    const result = runStage8MachineCommand({ ...command, cwd: 'web-customizer',
      validate: validateStage7Evidence, spawn: (...args) => {
        calls.push(args);
        return { status: 0, stdout: JSON.stringify(stage7EvidencePayload()), stderr: 'diagnostic' };
      } });
    expect(result).toMatchObject({ result: 'PASS', process: { stderr: 'diagnostic' } });
    expect(calls).toEqual([['node-executable', ['scripts/validate-stage7-evidence.mjs'], {
      cwd: 'web-customizer', encoding: 'utf8', windowsHide: true, shell: false,
    }]]);
  });

  it.each([
    [`> npm run check:stage7-evidence\n${JSON.stringify(stage7EvidencePayload())}`],
    [`${JSON.stringify(stage7EvidencePayload())}\nextra`],
    [''],
    ['not-json'],
  ])('rejects non-pure stage7-evidence stdout', (stdout) => {
    expect(classifyStage8MachineOutput({ status: 0, stdout, stderr: '' }, validateStage7Evidence).errorCode)
      .toBe('STAGE8_MACHINE_OUTPUT_INVALID');
  });

  it('separates stage7-evidence launch, execution, and schema failures', () => {
    expect(classifyStage8MachineOutput({ status: null, error: { code: 'EPERM' }, stdout: '', stderr: '' },
      validateStage7Evidence).errorCode).toBe('STAGE8_COMMAND_LAUNCH_FAILED');
    expect(classifyStage8MachineOutput({ status: 1, stdout: JSON.stringify(stage7EvidencePayload()), stderr: '' },
      validateStage7Evidence).errorCode).toBe('STAGE8_COMMAND_EXECUTION_FAILED');
    expect(classifyStage8MachineOutput({ status: 0, stdout: '{"result":"PASS"}', stderr: '' },
      validateStage7Evidence).errorCode).toBe('STAGE8_MACHINE_OUTPUT_SCHEMA_INVALID');
  });

  it('runs governance through its existing direct Node validator and strict schema', () => {
    const command = stage8MachineJsonCommand('governance', 'node-executable');
    const calls = [];
    const result = runStage8MachineCommand({ ...command, cwd: 'web-customizer', validate: validateGovernance,
      spawn: (...args) => { calls.push(args); return { status: 0, stdout: JSON.stringify(governancePayload()), stderr: '' }; } });
    expect(result.result).toBe('PASS');
    expect(calls[0][1]).toEqual(['scripts/check-governance.mjs']);
    expect(calls[0][2]).toMatchObject({ cwd: 'web-customizer', shell: false });
    expect(classifyStage8MachineOutput({ status: 0, stdout: '{"result":"PASS"}', stderr: '' },
      validateGovernance).errorCode).toBe('STAGE8_MACHINE_OUTPUT_SCHEMA_INVALID');
  });

  it('keeps registered gate order and prevents npm wrappers in the runner', () => {
    const source = readFileSync(join(import.meta.dirname, '../../scripts/run-stage8-quality-gate.mjs'), 'utf8');
    const phase2c = source.indexOf("stage8MachineJsonCommand('phase2cEvidenceFreeze'");
    const stage7 = source.indexOf("stage8MachineJsonCommand('stage7Evidence'");
    const governance = source.indexOf("stage8MachineJsonCommand('governance'");
    expect(phase2c).toBeGreaterThan(-1);
    expect(stage7).toBeGreaterThan(phase2c);
    expect(governance).toBeGreaterThan(stage7);
    expect(source).not.toMatch(/npmCommand\(\['run', 'check:(?:phase2c-evidence-freeze|stage7-evidence|governance)'\]\)/);
  });
});

describe('Stage 8 Python runtime policy', () => {
  it('accepts the configured 3.11.9 override and redacts its executable', () => {
    const identity = stage8PythonRuntimeIdentity(pythonResolution());
    expect(() => assertStage8PythonRuntimeReady(identity, 'Python 3.11.9')).not.toThrow();
    expect(identity).toMatchObject({ version: 'Python 3.11.9', source: 'NSS_PYTHON_EXECUTABLE',
      environmentOverride: true, probe: 'success' });
    expect(redactStage8PythonRuntimeIdentity(identity).executable).toBe('<NSS_PYTHON_EXECUTABLE>');
  });

  it('rejects an unavailable configured runtime', () => {
    const identity = stage8PythonRuntimeIdentity({ result: 'FAIL', runtime: null,
      attempts: [{ source: 'NSS_PYTHON_EXECUTABLE', status: null, errorCode: 'ENOENT', version: null }] });
    expect(() => assertStage8PythonRuntimeReady(identity, 'Python 3.11.9'))
      .toThrow('STAGE8_PYTHON_RUNTIME_UNAVAILABLE');
  });

  it('rejects a runtime that cannot launch', () => {
    const resolution = pythonResolution();
    resolution.attempts[0] = { source: 'NSS_PYTHON_EXECUTABLE', status: null, errorCode: 'EPERM', version: null };
    expect(() => assertStage8PythonRuntimeReady(stage8PythonRuntimeIdentity(resolution), 'Python 3.11.9'))
      .toThrow('STAGE8_PYTHON_RUNTIME_UNAVAILABLE');
  });

  it('rejects a non-reference version and any PATH selection', () => {
    const wrongVersion = stage8PythonRuntimeIdentity(pythonResolution({ runtime: { version: 'Python 3.14.6' } }));
    expect(() => assertStage8PythonRuntimeReady(wrongVersion, 'Python 3.11.9'))
      .toThrow('STAGE8_PYTHON_REFERENCE_RUNTIME_MISMATCH');
    const path = stage8PythonRuntimeIdentity(pythonResolution({ runtime: {
      executable: 'python', source: 'PATH_PYTHON', configured: false,
    } }));
    expect(() => assertStage8PythonRuntimeReady(path, 'Python 3.11.9')).toThrow('STAGE8_PYTHON_OVERRIDE_REQUIRED');
  });

  it('passes stable identities and stops on drift', () => {
    const start = stage8PythonRuntimeIdentity(pythonResolution());
    expect(() => assertStage8PythonRuntimeStable(start, { ...start })).not.toThrow();
    expect(() => assertStage8PythonRuntimeStable(start, { ...start, executable: 'different-python' }))
      .toThrow('STAGE8_PYTHON_RUNTIME_DRIFT_DURING_RUN');
  });

  it('separates compatibility policy from the observed reference runtime', () => {
    const path = join(import.meta.dirname, '../../runtime-requirements.json');
    const text = readFileSync(path, 'utf8');
    const requirements = JSON.parse(text);
    expect(requirements.python).toMatchObject({
      resolutionPolicy: 'FORMAL_DETERMINISTIC_RESOLVER',
      requiredCompatibility: 'UNSPECIFIED',
      stage8ReferenceRuntime: {
        version: '3.11.9',
        selectionMode: 'NSS_PYTHON_EXECUTABLE',
        source: 'NSS_PYTHON_EXECUTABLE',
      },
      dependencies: {
        jsonschema: {
          version: '4.26.0',
          versionSelectionSource: 'REPOSITORY_EXACT_PIN',
          requiredBy: 'part-specifications gate',
        },
      },
    });
    expect(text).not.toMatch(/[A-Za-z]:\\/);
    expect(text).not.toContain('ENV_OVERRIDE');
  });
});

describe('Stage 8 run isolation', () => {
  it('creates a stable UTC run id from the starting HEAD', () => {
    expect(stage8RunId(new Date('2026-07-17T08:09:10.123Z'), 'ac42b64573ab'))
      .toBe('stage8-delivery-20260717T080910Z-ac42b64');
  });

  it('refuses to reuse an existing run directory', () => {
    const root = temporaryDirectory();
    createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-a', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    expect(() => createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-a', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' })).toThrow(/already exists/i);
  });

  it('detects any change to pre-existing user files', () => {
    const root = temporaryDirectory();
    const file = join(root, 'user-change.json');
    writeFileSync(file, '{"value":1}\n');
    const before = snapshotFiles(root, ['user-change.json']);
    writeFileSync(file, '{"value":2}\n');
    expect(snapshotFiles(root, ['user-change.json'])).not.toEqual(before);
  });
});

describe('Stage 8 delivery checks', () => {
  it('accepts a complete non-empty Vite build without development references', () => {
    const dist = temporaryDirectory();
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="./assets/app.js"></script><link rel="stylesheet" href="./assets/app.css">');
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("ready")');
    writeFileSync(join(dist, 'assets', 'app.css'), 'body{color:white}');
    expect(inspectBuildOutput(dist)).toMatchObject({ result: 'PASS', errors: [] });
  });

  it('rejects zero-byte bundles and leaked local paths', () => {
    const dist = temporaryDirectory();
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="./assets/app.js"></script>');
    writeFileSync(join(dist, 'assets', 'app.js'), '');
    writeFileSync(join(dist, 'assets', 'leak.js'), 'C:\\Users\\Example\\secret test-artifacts http://localhost:9999/debug');
    const report = inspectBuildOutput(dist);
    expect(report.result).toBe('FAIL');
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/ZERO_BYTE/),
      expect.stringMatching(/ABSOLUTE_WINDOWS_PATH/),
      expect.stringMatching(/TEST_ARTIFACTS_REFERENCE/),
      expect.stringMatching(/LOCALHOST_REFERENCE/),
    ]));
  });

  it('parses Playwright pass and collection counts without inventing results', () => {
    expect(parsePlaywrightReport({ stats: { expected: 8, skipped: 0, unexpected: 0, flaky: 0 } }))
      .toEqual({ passed: 8, failed: 0, skipped: 0, flaky: 0, total: 8, status: 'PASS' });
  });

  it('requires pending human review and a provisional baseline in the final summary', () => {
    const summary = {
      schemaVersion: 'NSS-PHASE3B-STAGE8-V1',
      stage8Status: 'PASS_READY_FOR_HUMAN_VISUAL_REVIEW',
      phase3bStatus: 'CHANGES_REQUESTED',
      humanVisualReview: 'PENDING',
      baseline: { status: 'PROVISIONAL_NOT_FINAL', assetCount: 50, matched: 50, drift: 0, missing: 0, extra: 0 },
      baselineFinalizationAllowed: false,
    };
    expect(() => assertStage8Summary(summary)).not.toThrow();
    expect(() => assertStage8Summary({ ...summary, humanVisualReview: 'PASS' })).toThrow(/human visual review/i);
  });
});

describe('Stage 8 manifest', () => {
  it('records the required evidence type and directory skeleton', () => {
    const root = temporaryDirectory();
    const run = createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-a', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    const manifest = JSON.parse(readFileSync(run.manifestPath, 'utf8'));
    expect(manifest.evidenceType).toBe('STAGE8_CURRENT_DELIVERY_REVALIDATION');
    expect(manifest).toMatchObject({
      status: 'RUNNING',
      completedAt: null,
      nextMode: 'preflight',
      modeStatus: { preflight: 'PENDING', long: 'PENDING', finalize: 'PENDING' },
    });
    for (const directory of ['unit', 'typecheck', 'build', 'collection', 'runtime-smoke',
      'playwright-mobile-focused', 'playwright-mobile-full', 'playwright-desktop',
      'playwright-stage7-combined', 'playwright-legacy', 'governance', 'baseline', 'evidence']) {
      expect(manifest.directories).toContain(directory);
    }
  });

  it('advances successful phases without closing the run before finalize', () => {
    const root = temporaryDirectory();
    const run = createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-success', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    writeModeSummary(run, 'preflight');
    const afterPreflight = completeStage8Mode(run, 'preflight');
    expect(afterPreflight).toMatchObject({ status: 'RUNNING', completedAt: null, nextMode: 'long',
      modeStatus: { preflight: 'PASS', long: 'PENDING', finalize: 'PENDING' } });
    writeModeSummary(run, 'long');
    const afterLong = completeStage8Mode(run, 'long');
    expect(afterLong).toMatchObject({ status: 'RUNNING', completedAt: null, nextMode: 'finalize',
      modeStatus: { preflight: 'PASS', long: 'PASS', finalize: 'PENDING' } });
    writeFileSync(join(run.runDir, 'final-summary.json'), '{"status":"PASS"}\n');
    const afterFinalize = completeStage8Mode(run, 'finalize');
    expect(afterFinalize).toMatchObject({ status: 'PASS', nextMode: null,
      modeStatus: { preflight: 'PASS', long: 'PASS', finalize: 'PASS' } });
    expect(afterFinalize.completedAt).toEqual(expect.any(String));
    const hashes = JSON.parse(readFileSync(join(run.runDir, 'hashes.json'), 'utf8'));
    expect(hashes).toMatchObject({ runStatus: 'PASS', mode: 'finalize', failureClassification: null });
    expect(hashes.hashes).toHaveProperty('final-summary.json');
    expect(hashes.hashes).not.toHaveProperty('hashes.json');
  });

  it.each([
    ['preflight', { preflight: 'FAIL', long: 'NOT_REACHED', finalize: 'NOT_REACHED' }],
    ['long', { preflight: 'PASS', long: 'FAIL', finalize: 'NOT_REACHED' }],
    ['finalize', { preflight: 'PASS', long: 'PASS', finalize: 'FAIL' }],
  ])('closes a %s failure with mode-specific terminal state and audit hashes', (mode, modeStatus) => {
    const root = temporaryDirectory();
    const run = createStage8Run({ artifactRoot: root, runId: `stage8-delivery-${mode}-failure`,
      headCommit: 'a'.repeat(40), baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    if (mode !== 'preflight') {
      writeModeSummary(run, 'preflight');
      completeStage8Mode(run, 'preflight');
    }
    if (mode === 'finalize') {
      writeModeSummary(run, 'long');
      completeStage8Mode(run, 'long');
    }
    writeFileSync(join(run.runDir, 'evidence', 'primary.txt'), 'preserved');
    const result = finalizeStage8Failure(run, { mode, failureClassification: 'PRIMARY_GATE_FAILED',
      message: 'primary failure', failedGate: 'example-gate' });
    expect(result.manifest).toMatchObject({ status: 'FAIL', nextMode: null, modeStatus,
      failedMode: mode, failedGate: 'example-gate', failureClassification: 'PRIMARY_GATE_FAILED' });
    expect(result.manifest.completedAt).toEqual(expect.any(String));
    expect(result.failure).toMatchObject({ status: 'FAIL', mode, failureClassification: 'PRIMARY_GATE_FAILED',
      failedGate: 'example-gate', secondaryErrors: [] });
    expect(existsSync(join(run.runDir, `${mode}-failure.json`))).toBe(true);
    expect(result.hashes).toMatchObject({ runStatus: 'FAIL', mode, failureClassification: 'PRIMARY_GATE_FAILED' });
    expect(result.hashes.hashes).toHaveProperty('evidence/primary.txt');
    expect(result.hashes.hashes).toHaveProperty(`${mode}-failure.json`);
    expect(result.hashes.hashes).not.toHaveProperty('hashes.json');
  });

  it('keeps the primary failure when Python end identity produces a secondary error', () => {
    const root = temporaryDirectory();
    const run = createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-secondary', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    const result = finalizeStage8Failure(run, { mode: 'preflight', failureClassification: 'PRIMARY_GATE_FAILED',
      message: 'primary failure', secondaryErrors: [{ classification: 'STAGE8_PYTHON_RUNTIME_DRIFT_DURING_RUN',
        message: 'secondary identity failure' }] });
    expect(result.failure).toMatchObject({ failureClassification: 'PRIMARY_GATE_FAILED',
      secondaryErrors: [{ classification: 'STAGE8_PYTHON_RUNTIME_DRIFT_DURING_RUN',
        message: 'secondary identity failure' }] });
    expect(result.manifest.failureClassification).toBe('PRIMARY_GATE_FAILED');
  });

  it('does not rewrite the first terminal failure when closure is repeated', () => {
    const root = temporaryDirectory();
    const run = createStage8Run({ artifactRoot: root, runId: 'stage8-delivery-idempotent', headCommit: 'a'.repeat(40),
      baselineCommit: 'b'.repeat(40), workspaceDigest: 'digest' });
    finalizeStage8Failure(run, { mode: 'preflight', failureClassification: 'FIRST_FAILURE', message: 'first',
      secondaryErrors: [{ classification: 'SECONDARY', message: 'preserve me' }] });
    const before = {
      manifest: readFileSync(run.manifestPath, 'utf8'),
      failure: readFileSync(join(run.runDir, 'preflight-failure.json'), 'utf8'),
      hashes: readFileSync(join(run.runDir, 'hashes.json'), 'utf8'),
    };
    const repeated = finalizeStage8Failure(run, { mode: 'preflight', failureClassification: 'REPLACEMENT',
      message: 'replacement', secondaryErrors: [] });
    expect(repeated.manifest.failureClassification).toBe('FIRST_FAILURE');
    expect(readFileSync(run.manifestPath, 'utf8')).toBe(before.manifest);
    expect(readFileSync(join(run.runDir, 'preflight-failure.json'), 'utf8')).toBe(before.failure);
    expect(readFileSync(join(run.runDir, 'hashes.json'), 'utf8')).toBe(before.hashes);
  });
});
