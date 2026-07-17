import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyVerifierProcess,
  PYTHON_ERROR_CODES,
  resolvePythonRuntime,
  runPythonVerifier,
  runtimeReport,
} from '../../scripts/python-runtime.mjs';

const passPayload = (overrides = {}) => ({
  result: 'PASS',
  errorCode: null,
  assetCount: 50,
  matched: 50,
  drifted: 0,
  missing: 0,
  extra: 0,
  failedAssets: [],
  ...overrides,
});

const processResult = (overrides = {}) => ({
  status: 0,
  signal: null,
  stdout: JSON.stringify(passPayload()),
  stderr: '',
  ...overrides,
});

const spawnError = (code: string) => Object.assign(new Error(code), { code });

describe('Phase 2C Python runtime resolution', () => {
  it('selects a valid explicit Python executable first', () => {
    const spawn = vi.fn(() => processResult({ stdout: 'Python 3.12.13\n' }));
    const result = resolvePythonRuntime({
      env: { NSS_PYTHON_EXECUTABLE: 'D:\\tools\\python.exe' },
      platform: 'win32',
      spawn,
    });

    expect(result.result).toBe('PASS');
    expect(result.runtime?.source).toBe('NSS_PYTHON_EXECUTABLE');
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('passes an explicit path containing spaces as one executable value', () => {
    const executable = 'D:\\Program Files\\Python 3\\python.exe';
    const spawn = vi.fn((..._args: unknown[]) => processResult({ stdout: 'Python 3.12.13' }));
    resolvePythonRuntime({ env: { NSS_PYTHON_EXECUTABLE: executable }, platform: 'win32', spawn });

    expect(spawn.mock.calls[0][0]).toBe(executable);
    expect(spawn.mock.calls[0][1]).toEqual(['--version']);
  });

  it('fails an invalid explicit path without silently falling back', () => {
    const spawn = vi.fn(() => processResult({
      status: null,
      stdout: '',
      error: spawnError('ENOENT'),
    }));
    const result = resolvePythonRuntime({
      env: { NSS_PYTHON_EXECUTABLE: 'D:\\missing\\python.exe' },
      platform: 'win32',
      spawn,
    });

    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.NOT_FOUND);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable runtime as not started', () => {
    const spawn = vi.fn(() => processResult({
      status: null,
      stdout: '',
      error: spawnError('ENOENT'),
    }));
    const resolution = resolvePythonRuntime({
      env: { NSS_PYTHON_EXECUTABLE: 'D:\\missing\\python.exe' },
      platform: 'win32',
      spawn,
    });
    const report = runtimeReport(resolution, {
      result: 'FAIL',
      errorCode: PYTHON_ERROR_CODES.NOT_FOUND,
      assetCount: 50,
      matched: null,
      drifted: 0,
      missing: 0,
      extra: 0,
      failedAssets: [],
      process: null,
    });

    expect(report.launchStatus).toBe('NOT_STARTED');
  });

  it('keeps Windows candidate probing order deterministic', () => {
    const calls: Array<[string, string[]]> = [];
    const spawn = vi.fn((executable: string, args: string[]) => {
      calls.push([executable, args]);
      return executable === 'py'
        ? processResult({ stdout: 'Python 3.11.9' })
        : processResult({ status: null, stdout: '', error: spawnError('ENOENT') });
    });
    const result = resolvePythonRuntime({ env: {}, platform: 'win32', spawn });

    expect(calls.map(([executable]) => executable)).toEqual(['python3', 'python', 'py']);
    expect(result.runtime?.source).toBe('PATH_PY_LAUNCHER');
  });

  it('represents py launcher arguments separately from the executable', () => {
    const spawn = vi.fn((executable: string) => executable === 'py'
      ? processResult({ stdout: 'Python 3.11.9' })
      : processResult({ status: null, stdout: '', error: spawnError('ENOENT') }));
    const result = resolvePythonRuntime({ env: {}, platform: 'win32', spawn });

    expect(result.runtime?.executable).toBe('py');
    expect(result.runtime?.prefixArgs).toEqual(['-3']);
  });

  it('never probes with shell:true', () => {
    const spawn = vi.fn((..._args: unknown[]) => processResult({ stdout: 'Python 3.12.13' }));
    resolvePythonRuntime({ env: { NSS_PYTHON_EXECUTABLE: 'python3' }, platform: 'linux', spawn });

    expect(spawn.mock.calls[0][2]).toMatchObject({ shell: false });
  });

  it('redacts a configured absolute path from the versioned runtime report', () => {
    const actualPath = 'C:\\Users\\Example\\Program Files\\Python\\python.exe';
    const spawn = vi.fn(() => processResult({ stdout: 'Python 3.12.13' }));
    const resolution = resolvePythonRuntime({
      env: { NSS_PYTHON_EXECUTABLE: actualPath },
      platform: 'win32',
      spawn,
    });
    const report = runtimeReport(resolution, classifyVerifierProcess(processResult()));

    expect(JSON.stringify(report)).not.toContain('C:\\Users\\Example');
    expect(report.executable).toBe('<configured-python>/python.exe');
  });
});

describe('Phase 2C verifier error classification', () => {
  it('launches the verifier with executable and args separated and shell disabled', () => {
    const spawn = vi.fn((..._args: unknown[]) => processResult());
    runPythonVerifier(
      {
        executable: 'D:\\Program Files\\Python 3\\python.exe',
        prefixArgs: [],
      },
      'D:\\repo',
      { spawn },
    );

    expect(spawn.mock.calls[0][0]).toBe('D:\\Program Files\\Python 3\\python.exe');
    expect(spawn.mock.calls[0][1]).toEqual([
      'scripts/manage_phase2c_provisional_baseline.py',
      'verify',
    ]);
    expect(spawn.mock.calls[0][2]).toMatchObject({ cwd: 'D:\\repo', shell: false });
  });

  it.each(['EPERM', 'ENOENT'])('maps a %s spawn error to launch failure', (code) => {
    const result = classifyVerifierProcess(processResult({
      status: null,
      stdout: '',
      error: spawnError(code),
    }));

    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.LAUNCH_FAILED);
    expect(result.errorCode).not.toBe(PYTHON_ERROR_CODES.ASSET_DRIFT);
    expect(result.process!.spawnErrorCode).toBe(code);
  });

  it('maps status=null without an error object to launch failure', () => {
    const result = classifyVerifierProcess(processResult({ status: null }));
    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.LAUNCH_FAILED);
  });

  it('maps signal termination to verifier execution failure', () => {
    const result = classifyVerifierProcess(processResult({ status: 1, signal: 'SIGTERM' }));
    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.EXECUTION_FAILED);
  });

  it('maps a nonzero exit with a PASS payload to verifier execution failure', () => {
    const result = classifyVerifierProcess(processResult({ status: 2 }));
    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.EXECUTION_FAILED);
  });

  it.each([
    ['empty stdout', ''],
    ['non-JSON stdout', 'not-json'],
    ['valid JSON with the wrong schema', JSON.stringify({ result: 'PASS' })],
  ])('maps %s to verifier execution failure', (_label, stdout) => {
    const result = classifyVerifierProcess(processResult({ stdout }));
    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.EXECUTION_FAILED);
  });

  it('allows stderr diagnostics when structured verification succeeds', () => {
    const result = classifyVerifierProcess(processResult({ stderr: 'non-fatal warning' }));

    expect(result.result).toBe('PASS');
    expect(result.process!.stderrSummary).toBe('non-fatal warning');
  });

  it('preserves stdout, stderr, status, signal, and error code evidence', () => {
    const result = classifyVerifierProcess(processResult({
      status: null,
      signal: null,
      stdout: 'partial output',
      stderr: 'permission denied',
      error: spawnError('EPERM'),
    }));

    expect(result.process).toEqual({
      spawnStatus: null,
      spawnSignal: null,
      spawnErrorCode: 'EPERM',
      verifierExitCode: null,
      stdoutSummary: 'partial output',
      stderrSummary: 'permission denied',
    });
  });

  it('maps an explicit structured drift result to asset drift', () => {
    const payload = passPayload({
      result: 'FAIL',
      errorCode: PYTHON_ERROR_CODES.ASSET_DRIFT,
      matched: 49,
      drifted: 1,
      failedAssets: [{
        relativePath: 'public/models/parts/example.glb',
        expectedSha256: 'a',
        actualSha256: 'b',
      }],
    });
    const result = classifyVerifierProcess(processResult({ status: 1, stdout: JSON.stringify(payload) }));

    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.ASSET_DRIFT);
    expect(result.failedAssets).toEqual(payload.failedAssets);
  });

  it('accepts a structured 50/50 verification pass', () => {
    const result = classifyVerifierProcess(processResult());
    expect(result).toMatchObject({
      result: 'PASS',
      errorCode: null,
      assetCount: 50,
      matched: 50,
      drifted: 0,
      missing: 0,
      extra: 0,
    });
  });

  it('does not invent drift counts or paths for launch failures', () => {
    const result = classifyVerifierProcess(processResult({
      status: null,
      stdout: '',
      error: spawnError('EPERM'),
    }));

    expect(result).toMatchObject({ drifted: 0, missing: 0, extra: 0, failedAssets: [] });
  });

  it('maps a Python exception with no structured payload to execution failure', () => {
    const result = classifyVerifierProcess(processResult({
      status: 1,
      stdout: '',
      stderr: 'Traceback: fixture failure',
    }));

    expect(result.errorCode).toBe(PYTHON_ERROR_CODES.EXECUTION_FAILED);
    expect(result.process!.stderrSummary).toContain('Traceback');
  });

  it('detects controlled temporary-file byte drift without touching protected assets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nss-phase2c-drift-'));
    const manifestPath = join(directory, 'manifest.json');
    const assetPath = join(directory, 'asset.bin');
    try {
      writeFileSync(assetPath, Buffer.from('baseline'));
      const expectedSha256 = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
      writeFileSync(manifestPath, JSON.stringify({ relativePath: 'asset.bin', expectedSha256 }));
      writeFileSync(assetPath, Buffer.from('changed'));
      const actualSha256 = createHash('sha256').update(readFileSync(assetPath)).digest('hex');
      const payload = passPayload({
        result: 'FAIL',
        errorCode: PYTHON_ERROR_CODES.ASSET_DRIFT,
        matched: 49,
        drifted: 1,
        failedAssets: [{ relativePath: 'asset.bin', expectedSha256, actualSha256 }],
      });
      const result = classifyVerifierProcess(processResult({ status: 1, stdout: JSON.stringify(payload) }));

      expect(actualSha256).not.toBe(expectedSha256);
      expect(result.errorCode).toBe(PYTHON_ERROR_CODES.ASSET_DRIFT);
    } finally {
      unlinkSync(assetPath);
      unlinkSync(manifestPath);
      rmdirSync(directory);
    }
  });
});

describe('Phase 2C frozen scope', () => {
  it('keeps the baseline manifest and 50-asset scope unchanged', () => {
    const projectRoot = resolve(import.meta.dirname, '../../..');
    const manifestBytes = readFileSync(
      join(projectRoot, 'docs/baselines/v0.2.0-rc1-technical-baseline.json'),
    );
    const manifest = JSON.parse(manifestBytes.toString('utf8'));

    expect(createHash('sha256').update(manifestBytes).digest('hex'))
      .toBe('647502dbb852ed4c8387619973e5ac1e23d13117572eb42fa840cb26ed1add55');
    expect(manifest.parts).toHaveLength(16);
    expect(2 + manifest.parts.length * 3).toBe(50);
    expect(manifest.interface.id).toBe('NSS-V1');
  });
});
