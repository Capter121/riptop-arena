export const PYTHON_ERROR_CODES: Readonly<{
  NOT_FOUND: 'PYTHON_RUNTIME_NOT_FOUND';
  LAUNCH_FAILED: 'PYTHON_RUNTIME_LAUNCH_FAILED';
  EXECUTION_FAILED: 'PYTHON_VERIFIER_EXECUTION_FAILED';
  ASSET_DRIFT: 'PROVISIONAL_BASELINE_ASSET_DRIFT';
  PASS: 'PROVISIONAL_BASELINE_VERIFY_PASS';
}>;

export interface PythonRuntime {
  executable: string;
  displayExecutable: string;
  prefixArgs: string[];
  source: string;
  configured: boolean;
  version: string;
  platform: string;
}

export interface RuntimeResolution {
  result: 'PASS' | 'FAIL';
  errorCode: string | null;
  runtime: PythonRuntime | null;
  attempts: Array<Record<string, unknown>>;
}

export interface VerifierGate {
  result: 'PASS' | 'FAIL';
  errorCode: string | null;
  assetCount: number;
  matched: number | null;
  drifted: number;
  missing: number;
  extra: number;
  failedAssets: Array<Record<string, unknown>>;
  process: Record<string, unknown> | null;
}

export type SpawnLike = (
  executable: string,
  args: string[],
  options: Record<string, unknown>,
) => any;

export function resolvePythonRuntime(options?: {
  env?: Record<string, string | undefined>;
  platform?: string;
  spawn?: SpawnLike;
}): RuntimeResolution;

export function classifyVerifierProcess(
  processResult: any,
  options?: { assetCount?: number },
): VerifierGate;

export function runPythonVerifier(
  runtime: Pick<PythonRuntime, 'executable' | 'prefixArgs'>,
  projectRoot: string,
  options?: { spawn?: SpawnLike },
): VerifierGate;

export function runtimeReport(
  resolution: RuntimeResolution,
  gate: VerifierGate,
): Record<string, unknown>;
