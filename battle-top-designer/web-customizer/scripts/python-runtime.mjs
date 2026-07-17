import { spawnSync } from 'node:child_process';
import { basename, isAbsolute } from 'node:path';

export const PYTHON_ERROR_CODES = Object.freeze({
  NOT_FOUND: 'PYTHON_RUNTIME_NOT_FOUND',
  LAUNCH_FAILED: 'PYTHON_RUNTIME_LAUNCH_FAILED',
  EXECUTION_FAILED: 'PYTHON_VERIFIER_EXECUTION_FAILED',
  ASSET_DRIFT: 'PROVISIONAL_BASELINE_ASSET_DRIFT',
  PASS: 'PROVISIONAL_BASELINE_VERIFY_PASS',
});

const PYTHON_3_VERSION = /Python\s+3\.\d+(?:\.\d+)?/i;
const SUMMARY_LIMIT = 1200;

function summarize(value) {
  const text = String(value ?? '').trim();
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}…` : text;
}

function displayExecutable(executable, configured) {
  if (configured && isAbsolute(executable)) {
    return `<configured-python>/${basename(executable)}`;
  }
  return isAbsolute(executable) ? `<resolved-python>/${basename(executable)}` : executable;
}

function candidatesFor(platform, configuredExecutable) {
  if (configuredExecutable) {
    return [{
      executable: configuredExecutable,
      prefixArgs: [],
      source: 'NSS_PYTHON_EXECUTABLE',
      configured: true,
    }];
  }
  if (platform === 'win32') {
    return [
      { executable: 'python3', prefixArgs: [], source: 'PATH_PYTHON3', configured: false },
      { executable: 'python', prefixArgs: [], source: 'PATH_PYTHON', configured: false },
      { executable: 'py', prefixArgs: ['-3'], source: 'PATH_PY_LAUNCHER', configured: false },
    ];
  }
  return [
    { executable: 'python3', prefixArgs: [], source: 'PATH_PYTHON3', configured: false },
    { executable: 'python', prefixArgs: [], source: 'PATH_PYTHON', configured: false },
  ];
}

export function resolvePythonRuntime({
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  const configuredExecutable = env.NSS_PYTHON_EXECUTABLE?.trim() || null;
  const candidates = candidatesFor(platform, configuredExecutable);
  const attempts = [];

  for (const candidate of candidates) {
    const probe = spawn(
      candidate.executable,
      [...candidate.prefixArgs, '--version'],
      { encoding: 'utf8', windowsHide: true, shell: false },
    );
    const versionOutput = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`.trim();
    const version = versionOutput.match(PYTHON_3_VERSION)?.[0] ?? null;
    attempts.push({
      executable: displayExecutable(candidate.executable, candidate.configured),
      source: candidate.source,
      status: probe.status ?? null,
      signal: probe.signal ?? null,
      errorCode: probe.error?.code ?? null,
      version,
    });
    if (!probe.error && probe.status === 0 && version) {
      return {
        result: 'PASS',
        errorCode: null,
        runtime: {
          ...candidate,
          displayExecutable: displayExecutable(candidate.executable, candidate.configured),
          version,
          platform,
        },
        attempts,
      };
    }
    if (configuredExecutable) break;
  }

  return {
    result: 'FAIL',
    errorCode: PYTHON_ERROR_CODES.NOT_FOUND,
    runtime: null,
    attempts,
  };
}

function verifierSchemaValid(payload) {
  if (!payload || !['PASS', 'FAIL'].includes(payload.result)) return false;
  for (const key of ['assetCount', 'matched', 'drifted', 'missing', 'extra']) {
    if (!Number.isInteger(payload[key]) || payload[key] < 0) return false;
  }
  if (!Array.isArray(payload.failedAssets)) return false;
  if (payload.result === 'PASS') {
    return payload.errorCode === null
      && payload.matched === payload.assetCount
      && payload.drifted === 0
      && payload.missing === 0
      && payload.extra === 0
      && payload.failedAssets.length === 0;
  }
  if (payload.errorCode !== PYTHON_ERROR_CODES.ASSET_DRIFT) return false;
  return payload.drifted + payload.missing + payload.extra > 0
    && payload.failedAssets.length > 0;
}

function processEvidence(processResult) {
  return {
    spawnStatus: processResult.status ?? null,
    spawnSignal: processResult.signal ?? null,
    spawnErrorCode: processResult.error?.code ?? null,
    verifierExitCode: processResult.status ?? null,
    stdoutSummary: summarize(processResult.stdout),
    stderrSummary: summarize(processResult.stderr),
  };
}

function failedGate(errorCode, processResult, assetCount) {
  return {
    result: 'FAIL',
    errorCode,
    assetCount,
    matched: null,
    drifted: 0,
    missing: 0,
    extra: 0,
    failedAssets: [],
    process: processEvidence(processResult),
  };
}

export function classifyVerifierProcess(processResult, { assetCount = 50 } = {}) {
  if (processResult.error || processResult.status === null) {
    return failedGate(PYTHON_ERROR_CODES.LAUNCH_FAILED, processResult, assetCount);
  }
  if (processResult.signal) {
    return failedGate(PYTHON_ERROR_CODES.EXECUTION_FAILED, processResult, assetCount);
  }

  let payload;
  try {
    payload = JSON.parse(String(processResult.stdout ?? '').trim());
  } catch {
    return failedGate(PYTHON_ERROR_CODES.EXECUTION_FAILED, processResult, assetCount);
  }
  if (!verifierSchemaValid(payload)) {
    return failedGate(PYTHON_ERROR_CODES.EXECUTION_FAILED, processResult, assetCount);
  }
  if (payload.result === 'FAIL' && payload.errorCode === PYTHON_ERROR_CODES.ASSET_DRIFT) {
    return { ...payload, process: processEvidence(processResult) };
  }
  if (processResult.status !== 0) {
    return failedGate(PYTHON_ERROR_CODES.EXECUTION_FAILED, processResult, assetCount);
  }
  return { ...payload, process: processEvidence(processResult) };
}

export function runPythonVerifier(runtime, projectRoot, { spawn = spawnSync } = {}) {
  const processResult = spawn(
    runtime.executable,
    [...runtime.prefixArgs, 'scripts/manage_phase2c_provisional_baseline.py', 'verify'],
    { cwd: projectRoot, encoding: 'utf8', windowsHide: true, shell: false },
  );
  return classifyVerifierProcess(processResult);
}

export function runtimeReport(resolution, gate) {
  const runtime = resolution.runtime;
  return {
    resolution: resolution.result === 'PASS' ? runtime.source : resolution.errorCode,
    executable: runtime?.displayExecutable ?? null,
    prefixArgs: runtime?.prefixArgs ?? [],
    version: runtime?.version ?? null,
    platform: runtime?.platform ?? process.platform,
    launchStatus: gate?.process?.spawnErrorCode
      ? 'FAILED'
      : gate?.process?.spawnStatus == null
        ? 'NOT_STARTED'
        : 'STARTED',
    spawnStatus: gate?.process?.spawnStatus ?? null,
    spawnSignal: gate?.process?.spawnSignal ?? null,
    spawnErrorCode: gate?.process?.spawnErrorCode ?? null,
    verifierExitCode: gate?.process?.verifierExitCode ?? null,
    stdoutSummary: gate?.process?.stdoutSummary ?? '',
    stderrSummary: gate?.process?.stderrSummary ?? '',
  };
}
