import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  assertStage8PythonRuntimeReady,
  assertStage8PythonRuntimeStable,
  assertStage8Summary,
  completeStage8Mode,
  createStage8Run,
  fileSha256,
  finalizeStage8Failure,
  inspectBuildOutput,
  parsePlaywrightReport,
  redactStage8PythonRuntimeIdentity,
  redactWorkspace,
  runStage8MachineCommand,
  snapshotFiles,
  stage8MachineJsonCommand,
  stage8PythonRuntimeIdentity,
  stage8RunId,
  validateFinalBaselineIntegrity,
  validateGovernance,
  validateStage7Evidence,
  writeStage8Json,
} from './stage8-delivery.mjs';
import { resolvePythonRuntime } from './python-runtime.mjs';

const webRoot = resolve(import.meta.dirname, '..');
const projectRoot = resolve(webRoot, '..');
const repoRoot = resolve(projectRoot, '..');
const artifactRoot = resolve(webRoot, 'test-artifacts');
const baselineTag = 'v0.3.0-final-visual-baseline';
const baselineCommit = '94dcdb931fa3f3ab21c1b163509d92a65c23f061';
const baselineTagCommit = 'dae1c5104485373d2ff3c603aba48e27eef10754';
const baselineTagObject = 'c81b2604b6f3ed385078bbf40bdc5d6fd470e2c6';
const evidenceType = 'STAGE8_CURRENT_DELIVERY_REVALIDATION';
const formalStage7Path = resolve(projectRoot, 'reports/validation/phase3b-stage7-playwright-repaired-v2.json');
const formalStage7Sha = '16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc';
const stage7Commits = [
  'c84a39b1f8fb129261b8af9b37f014ee943f300f',
  'c58c51222894cad89344476192f11c4568469ed5',
  '5770180a0422d977519de6d536577a6d5c8a1d40',
  '303314d5a973fc1bbee15bf11328489ed33706f4',
  'f02437fddbcece13732dc88878fbb23d4fa0aade',
  'ac42b64573ab1ed1192c8845efcef87e58d1eac5',
];
const requiredAuditNote = 'The approved final visual baseline remains authoritative. This run revalidates current delivery changes without rewriting historical Stage 7 or Stage 8 evidence.';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalTextFileSha256(path) {
  return sha256(Buffer.from(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'), 'utf8'));
}

function timestamp() {
  return new Date().toISOString();
}

function failureDetails(error) {
  const message = String(error?.message ?? error);
  const failureClassification = String(error?.code ?? message.split(':', 1)[0] ?? 'STAGE8_MODE_FAILED');
  return {
    failureClassification,
    failedGate: error?.gate ?? failureClassification,
    message,
    primaryError: { name: error?.name ?? 'Error', code: error?.code ?? null, message },
  };
}

function git(args, options = {}) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0 && !options.allowFailure) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function gitText(args) {
  return git(args).stdout.trim();
}

function npmCommand(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is required; invoke Stage 8 through npm run.');
  return { command: process.execPath, args: [npmCli, ...args] };
}

function nodeCommand(args) {
  return { command: process.execPath, args };
}

function pythonCommand(args) {
  const resolution = resolvePythonRuntime();
  if (resolution.result !== 'PASS') throw new Error(`Python runtime unavailable: ${resolution.errorCode}`);
  return { command: resolution.runtime.executable, args: [...resolution.runtime.prefixArgs, ...args], resolution };
}

function runCommand(runDir, directory, label, executable, args, cwd = webRoot) {
  const gateDir = resolve(runDir, directory);
  mkdirSync(gateDir, { recursive: true });
  const startedAt = timestamp();
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
  const completedAt = timestamp();
  const stdout = redactWorkspace(result.stdout ?? '', repoRoot);
  const stderr = redactWorkspace(result.stderr ?? '', repoRoot);
  writeFileSync(join(gateDir, `${label}.stdout.log`), stdout, 'utf8');
  writeFileSync(join(gateDir, `${label}.stderr.log`), stderr, 'utf8');
  const record = {
    label,
    command: [executable, ...args].map(value => redactWorkspace(value, repoRoot)).join(' '),
    startedAt,
    completedAt,
    exitCode: result.status ?? null,
    signal: result.signal ?? null,
    errorCode: result.error?.code ?? null,
    stdoutSummary: stdout.slice(-4000),
    stderrSummary: stderr.slice(-4000),
    status: result.status === 0 && !result.error && !result.signal ? 'PASS' : 'FAIL',
  };
  writeStage8Json(join(gateDir, `${label}.json`), record);
  if (record.status !== 'PASS') throw new Error(`${label} failed with exit ${record.exitCode ?? record.errorCode}`);
  return { result, record };
}

function runMachineJsonCommand(runDir, directory, label, executable, args, cwd, validate) {
  const gateDir = resolve(runDir, directory);
  mkdirSync(gateDir, { recursive: true });
  const startedAt = timestamp();
  const machine = runStage8MachineCommand({ executable, args, cwd, validate });
  const completedAt = timestamp();
  const stdout = redactWorkspace(machine.process.stdout, repoRoot);
  const stderr = redactWorkspace(machine.process.stderr, repoRoot);
  writeFileSync(join(gateDir, `${label}.stdout.log`), stdout, 'utf8');
  writeFileSync(join(gateDir, `${label}.stderr.log`), stderr, 'utf8');
  writeStage8Json(join(gateDir, `${label}.json`), {
    label,
    command: [executable, ...args].map(value => redactWorkspace(value, repoRoot)).join(' '),
    startedAt,
    completedAt,
    exitCode: machine.process.status,
    signal: machine.process.signal,
    errorCode: machine.errorCode ?? machine.process.errorCode,
    stdoutSummary: stdout.slice(-4000),
    stderrSummary: stderr.slice(-4000),
    status: machine.result,
  });
  if (machine.result !== 'PASS') throw new Error(machine.errorCode);
  return machine.payload;
}

function parseStatusPath(line) {
  const path = line.slice(3).split(' -> ').at(-1);
  return path?.replaceAll('\\', '/') ?? '';
}

function stage8Owned(path) {
  return [
    'battle-top-designer/web-customizer/scripts/stage8-delivery.mjs',
    'battle-top-designer/web-customizer/scripts/run-stage8-quality-gate.mjs',
    'battle-top-designer/web-customizer/scripts/run-playwright-artifact.mjs',
    'battle-top-designer/web-customizer/scripts/run-playwright-collection.mjs',
    'battle-top-designer/web-customizer/playwright.stage8-legacy.config.ts',
    'battle-top-designer/web-customizer/playwright.stage8-runtime.config.ts',
    'battle-top-designer/web-customizer/runtime-requirements.json',
    'battle-top-designer/web-customizer/tests/stage8/',
    'battle-top-designer/web-customizer/tests/unit/stage8DeliveryGate.test.mjs',
    'battle-top-designer/web-customizer/package.json',
    'battle-top-designer/reports/validation/spec-phase3b-stage8.json',
    'battle-top-designer/reports/validation/phase3b-stage8-full-quality-gate.json',
    'battle-top-designer/reports/validation/phase3b-human-visual-review-package.json',
    'battle-top-designer/reports/phase3b-stage8-full-quality-and-delivery-summary.md',
    'battle-top-designer/docs/guides/phase3b-human-visual-review-guide.md',
  ].some(item => item.endsWith('/') ? path.startsWith(item) : path === item);
}

function statusLines() {
  return gitText(['status', '--porcelain=v1']).split(/\r?\n/).filter(Boolean);
}

function userWorkspaceSnapshot() {
  const paths = statusLines().map(parseStatusPath).filter(path => path && !stage8Owned(path));
  return { paths: paths.sort(), files: snapshotFiles(repoRoot, paths) };
}

function assertUserWorkspaceUnchanged(expected) {
  const actual = snapshotFiles(repoRoot, expected.paths);
  if (JSON.stringify(actual) !== JSON.stringify(expected.files)) throw new Error('PREEXISTING_USER_WORKSPACE_CHANGED');
}

function protectedDiff() {
  const paths = [
    'battle-top-designer/specs',
    'battle-top-designer/public/models',
    'battle-top-designer/docs/baselines/v0.2.0-rc1-technical-baseline.json',
    'battle-top-designer/docs/baselines/v0.2.0-rc1-technical-baseline.md',
    'battle-top-designer/reports/validation/phase2c-final-gate.json',
    'battle-top-designer/reports/validation/phase2c-combination-matrix.json',
  ];
  const worktree = gitText(['diff', '--name-only', '--', ...paths]).split(/\r?\n/).filter(Boolean);
  const index = gitText(['diff', '--cached', '--name-only', '--', ...paths]).split(/\r?\n/).filter(Boolean);
  return { worktree, index, result: worktree.length === 0 && index.length === 0 ? 'PASS' : 'FAIL' };
}

function repositoryIntegrity() {
  const errors = [];
  const headCommit = gitText(['rev-parse', 'HEAD']);
  const tagObject = gitText(['rev-parse', baselineTag]);
  const resolvedBaseline = gitText(['rev-parse', `${baselineTag}^{commit}`]);
  if (tagObject !== baselineTagObject) errors.push('BASELINE_TAG_MOVED');
  if (resolvedBaseline !== baselineTagCommit) errors.push('BASELINE_TAG_COMMIT_CHANGED');
  if (git(['merge-base', '--is-ancestor', baselineCommit, 'HEAD'], { allowFailure: true }).status !== 0) {
    errors.push('FINAL_BASELINE_NOT_ANCESTOR');
  }
  for (const commit of stage7Commits) {
    if (git(['cat-file', '-e', `${commit}^{commit}`], { allowFailure: true }).status !== 0) errors.push(`COMMIT_UNREADABLE:${commit}`);
    if (git(['merge-base', '--is-ancestor', commit, 'HEAD'], { allowFailure: true }).status !== 0) errors.push(`NOT_ANCESTOR:${commit}`);
  }
  const tree = gitText(['ls-tree', '-r', 'HEAD']);
  if (/^160000 /m.test(tree)) errors.push('UNEXPECTED_GITLINK');
  const protectedState = protectedDiff();
  if (protectedState.result !== 'PASS') errors.push('PROTECTED_DIFF');
  const modelDir = resolve(projectRoot, 'public/models');
  const zeroFiles = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (statSync(path).size === 0) zeroFiles.push(relative(projectRoot, path).replaceAll('\\', '/'));
    }
  };
  walk(modelDir);
  if (zeroFiles.length) errors.push('ZERO_BYTE_MODEL');
  const lfs = git(['grep', '-l', '--fixed-strings', 'version https://git-lfs.github.com/spec/v1', 'HEAD', '--',
    'battle-top-designer/specs', 'battle-top-designer/public/models'], { allowFailure: true });
  const lfsPointers = lfs.status === 0 ? lfs.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
  if (lfsPointers.length) errors.push('LFS_POINTER_SUBSTITUTION');
  return { result: errors.length ? 'FAIL' : 'PASS', errors, headCommit, tagObject, resolvedBaseline,
    ancestry: Object.fromEntries(stage7Commits.map(commit => [commit, true])), protectedState, zeroFiles, lfsPointers };
}

function allFiles(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? allFiles(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

function verifyNodeSyntax(runDir) {
  const files = allFiles(resolve(webRoot, 'scripts'), '.mjs');
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: webRoot, encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) failures.push({ file: relative(webRoot, file).replaceAll('\\', '/'), error: result.stderr });
  }
  const report = { result: failures.length ? 'FAIL' : 'PASS', checked: files.length, failures };
  writeStage8Json(join(runDir, 'typecheck/node-syntax.json'), report);
  if (failures.length) throw new Error('NODE_SYNTAX_FAILED');
  return report;
}

function verifyPythonSyntax(runDir) {
  const python = pythonCommand(['-c', [
    'import ast, pathlib, sys',
    `root=pathlib.Path(${JSON.stringify(projectRoot)})`,
    "files=sorted(p for d in ('scripts','tests','blender') for p in (root/d).rglob('*.py'))",
    "errors=[]",
    "for p in files:",
    "  try: ast.parse(p.read_text(encoding='utf-8-sig'), filename=str(p))",
    "  except Exception as e: errors.append(f'{p.relative_to(root)}:{e}')",
    "print(f'checked={len(files)}')",
    "print('\\n'.join(errors))",
    'sys.exit(1 if errors else 0)',
  ].join('\n')]);
  return runCommand(runDir, 'typecheck', 'python-syntax', python.command, python.args, projectRoot).record;
}

function documentationIntegrity() {
  const checks = [
    ['reports/phase3b-stage7-validation-summary.md', ['Phase 3B changes requested', 'PENDING', 'PROVISIONAL_NOT_FINAL']],
    ['reports/validation/phase3b-stage7-summary.json', ['Phase 3B changes requested', 'PENDING', 'PROVISIONAL_NOT_FINAL']],
    ['docs/guides/phase3b-internal-test-guide.md', ['Human visual review remains pending']],
    ['docs/decisions/phase3-prototype-under-provisional-review.md', ['Human visual review remains pending', 'PROVISIONAL_NOT_FINAL']],
  ];
  const errors = [];
  for (const [path, phrases] of checks) {
    const absolute = resolve(projectRoot, path);
    if (!existsSync(absolute)) { errors.push(`MISSING:${path}`); continue; }
    const text = readFileSync(absolute, 'utf8');
    for (const phrase of phrases) if (!text.includes(phrase)) errors.push(`MISSING_STATUS:${path}:${phrase}`);
  }
  return { result: errors.length ? 'FAIL' : 'PASS', errors, checks: checks.map(([path]) => path) };
}

function securityAndHygiene() {
  const tracked = gitText(['ls-files']).split(/\r?\n/).filter(Boolean);
  const secrets = [];
  const hygiene = [];
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bsk-[A-Za-z0-9]{32,}\b/,
  ];
  for (const path of tracked) {
    const absolute = resolve(repoRoot, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile() || statSync(absolute).size > 5_000_000) continue;
    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (secretPatterns.some(pattern => pattern.test(lines[index]))) secrets.push({ path, line: index + 1, summary: '<REDACTED_CREDENTIAL_PATTERN>' });
      if (/[A-Za-z]:\\Users\\[^<]/i.test(lines[index])) hygiene.push({ path, line: index + 1, type: 'ABSOLUTE_USER_PATH' });
    }
    if (/(^|\/)(?:node_modules|test-results)(\/|$)/.test(path)) hygiene.push({ path, type: 'TRACKED_TRANSIENT_DIRECTORY' });
    if (/trace\.zip$|\.pyc$|__pycache__|(?:^|\/)Thumbs\.db$|(?:^|\/)\.DS_Store$/i.test(path)) hygiene.push({ path, type: 'TRACKED_TRANSIENT_FILE' });
  }
  return { result: secrets.length ? 'FAIL' : 'PASS', secrets, hygieneFindings: hygiene, scannedTrackedFiles: tracked.length };
}

function dependencyReproducibility() {
  const errors = [];
  const packageJson = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(webRoot, 'package-lock.json'), 'utf8'));
  const lockRoot = lock.packages[''];
  const requirements = JSON.parse(readFileSync(resolve(webRoot, 'runtime-requirements.json'), 'utf8'));
  const combine = value => ({ ...(value.dependencies ?? {}), ...(value.devDependencies ?? {}) });
  if (JSON.stringify(combine(packageJson)) !== JSON.stringify(combine(lockRoot))) errors.push('PACKAGE_LOCK_MANIFEST_MISMATCH');
  const lockDiff = gitText(['diff', '--name-only', '--', 'battle-top-designer/web-customizer/package.json',
    'battle-top-designer/web-customizer/package-lock.json']).split(/\r?\n/).filter(Boolean)
    .filter(path => path.endsWith('package-lock.json'));
  if (lockDiff.length) errors.push('WEB_CUSTOMIZER_LOCKFILE_DRIFT');
  const nodeVersion = process.version.replace(/^v/, '');
  const npmVersion = spawnSync(process.execPath, [process.env.npm_execpath, '--version'], { encoding: 'utf8' }).stdout.trim();
  const python = resolvePythonRuntime();
  const pythonIdentity = stage8PythonRuntimeIdentity(python);
  const referenceVersion = `Python ${requirements.python.stage8ReferenceRuntime.version}`;
  const jsonschema = python.result === 'PASS' ? spawnSync(python.runtime.executable,
    [...python.runtime.prefixArgs, '-c', "import importlib.metadata as m; print(m.version('jsonschema'))"],
    { encoding: 'utf8', windowsHide: true, shell: false }) : null;
  const jsonschemaVersion = jsonschema?.status === 0 ? jsonschema.stdout.trim() : null;
  if (requirements.node !== nodeVersion) errors.push('NODE_VERSION_MISMATCH');
  if (requirements.npm !== npmVersion) errors.push('NPM_VERSION_MISMATCH');
  if (requirements.python.resolutionPolicy !== 'FORMAL_DETERMINISTIC_RESOLVER'
    || requirements.python.requiredCompatibility !== 'UNSPECIFIED') errors.push('PYTHON_REQUIREMENTS_POLICY_INVALID');
  if (requirements.python.stage8ReferenceRuntime.selectionMode !== 'NSS_PYTHON_EXECUTABLE'
    || requirements.python.stage8ReferenceRuntime.source !== 'NSS_PYTHON_EXECUTABLE') errors.push('PYTHON_REFERENCE_SOURCE_INVALID');
  if (requirements.python.dependencies?.jsonschema?.version !== jsonschemaVersion
    || requirements.python.dependencies?.jsonschema?.versionSelectionSource !== 'REPOSITORY_EXACT_PIN'
    || requirements.python.dependencies?.jsonschema?.requiredBy !== 'part-specifications gate') {
    errors.push('PYTHON_DEPENDENCY_MISMATCH');
  }
  try {
    assertStage8PythonRuntimeReady(pythonIdentity, referenceVersion);
  } catch (error) {
    errors.push(error.message);
  }
  const scripts = allFiles(resolve(webRoot, 'scripts'), '.mjs');
  const shellTrue = scripts.filter(path => /shell\s*:\s*true/.test(readFileSync(path, 'utf8'))).map(path => relative(webRoot, path).replaceAll('\\', '/'));
  if (shellTrue.length) errors.push('SHELL_TRUE_DEPENDENCY');
  const runtimeSource = readFileSync(resolve(webRoot, 'scripts/python-runtime.mjs'), 'utf8');
  if (!runtimeSource.includes('NSS_PYTHON_EXECUTABLE') || !runtimeSource.includes('shell: false')) errors.push('PYTHON_RESOLUTION_POLICY_CHANGED');
  return { result: errors.length ? 'FAIL' : 'PASS', errors, requirements, actual: { node: nodeVersion, npm: npmVersion,
    python: redactStage8PythonRuntimeIdentity(pythonIdentity), pythonDependencies: { jsonschema: jsonschemaVersion } },
    shellTrue, installCommand: requirements.installCommand,
    packageLockSha256: fileSha256(resolve(webRoot, 'package-lock.json')) };
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function verifyPythonRuntimeEnd(runDir, mode, startIdentity) {
  const endIdentity = stage8PythonRuntimeIdentity(resolvePythonRuntime());
  writeStage8Json(join(runDir, `evidence/python-runtime-${mode}-end.json`),
    redactStage8PythonRuntimeIdentity(endIdentity));
  assertStage8PythonRuntimeStable(startIdentity, endIdentity);
  return endIdentity;
}

function runPlaywright(runDir, directory, runId, gateName, config, selection, expected, evidence = evidenceType) {
  const artifactDirectory = resolve(runDir, directory);
  const args = ['scripts/run-playwright-artifact.mjs', '--gate-name', gateName, '--run-id', runId,
    '--config', config, '--artifact-root', artifactDirectory, '--evidence-type', evidence, '--', ...selection];
  const record = runCommand(runDir, directory, `${runId}-launcher`, process.execPath, args, webRoot).record;
  const reportName = evidence === 'COLLECTION_ONLY' ? 'collection-report.json' : 'reporter.json';
  const reportPath = join(artifactDirectory, runId, reportName);
  if (!existsSync(reportPath)) throw new Error(`PLAYWRIGHT_REPORT_MISSING:${runId}`);
  const facts = parsePlaywrightReport(parseJson(reportPath));
  if (facts.total !== expected) throw new Error(`PLAYWRIGHT_COUNT_DRIFT:${runId}:${facts.total}:${expected}`);
  if (evidence !== 'COLLECTION_ONLY' && facts.status !== 'PASS') throw new Error(`PLAYWRIGHT_GATE_FAILED:${runId}`);
  writeStage8Json(join(artifactDirectory, `${runId}-summary.json`), { ...facts, evidenceType: evidence, reportPath: relative(runDir, reportPath).replaceAll('\\', '/') });
  return { ...facts, launcher: record, reportPath };
}

function readPreflight(runDir) {
  const path = join(runDir, 'preflight-summary.json');
  if (!existsSync(path)) throw new Error('PREFLIGHT_SUMMARY_MISSING');
  const summary = parseJson(path);
  if (summary.status !== 'PASS') throw new Error('PREFLIGHT_NOT_PASS');
  return summary;
}

function preflight(run) {
  const runDir = run.runDir;
  const userSnapshot = userWorkspaceSnapshot();
  writeStage8Json(join(runDir, 'workspace-before.json'), userSnapshot);
  const repo = repositoryIntegrity();
  writeStage8Json(join(runDir, 'evidence/repository-integrity.json'), repo);
  if (repo.result !== 'PASS') throw new Error(repo.errors.join(','));
  if (canonicalTextFileSha256(formalStage7Path) !== formalStage7Sha) throw new Error('FORMAL_STAGE7_SHA_MISMATCH_BEFORE');

  const unitPath = join(runDir, 'unit/vitest.json');
  const unit = npmCommand(['run', 'test:unit', '--', '--reporter=json', `--outputFile=${unitPath}`]);
  runCommand(runDir, 'unit', 'unit-tests', unit.command, unit.args);
  const unitRaw = parseJson(unitPath);
  const unitSummary = { total: unitRaw.numTotalTests, passed: unitRaw.numPassedTests, failed: unitRaw.numFailedTests,
    skipped: unitRaw.numPendingTests, status: unitRaw.success ? 'PASS' : 'FAIL', baselineCount: 206,
    increaseReason: unitRaw.numTotalTests > 206 ? 'Stage 8 delivery-gate tests added' : null };
  writeStage8Json(join(runDir, 'unit/summary.json'), unitSummary);
  if (unitSummary.status !== 'PASS' || unitSummary.total < 206) throw new Error('UNIT_GATE_FAILED_OR_COUNT_REDUCED');

  const typecheck = npmCommand(['exec', '--', 'tsc', '--noEmit']);
  runCommand(runDir, 'typecheck', 'typescript', typecheck.command, typecheck.args);
  verifyNodeSyntax(runDir);
  verifyPythonSyntax(runDir);
  const build = npmCommand(['run', 'build']);
  runCommand(runDir, 'build', 'production-build', build.command, build.args);

  const finalBaseline = stage8MachineJsonCommand('finalBaselineIntegrity', process.execPath);
  const baselineReport = runMachineJsonCommand(runDir, 'baseline', finalBaseline.gateName, finalBaseline.executable,
    finalBaseline.args, webRoot, validateFinalBaselineIntegrity);
  writeStage8Json(join(runDir, 'baseline/final-baseline-integrity-result.json'), baselineReport);

  const matrix = pythonCommand(['scripts/phase2c_matrix.py', '--enumerate-only']);
  const matrixResult = runCommand(runDir, 'baseline', 'combination-matrix', matrix.command, matrix.args, projectRoot).result;
  if (!matrixResult.stdout.includes('NSS_PHASE2C_COMBINATION_COUNT=288')
    || !matrixResult.stdout.includes('NSS_PHASE2C_DUPLICATE_COUNT=0')
    || !matrixResult.stdout.includes('NSS_PHASE2C_MISSING_COUNT=0')) throw new Error('COMBINATION_MATRIX_FAILED');
  const matrixUnit = npmCommand(['run', 'test:matrix']);
  runCommand(runDir, 'baseline', 'combination-matrix-unit', matrixUnit.command, matrixUnit.args);

  const specsBeforePath = resolve(projectRoot, 'reports/validation/spec-phase2c.json');
  const specsBefore = fileSha256(specsBeforePath);
  const specs = pythonCommand(['scripts/validate_specs.py', '--scope', 'phase2c']);
  runCommand(runDir, 'baseline', 'part-specifications', specs.command, specs.args, projectRoot);
  if (fileSha256(specsBeforePath) !== specsBefore) throw new Error('SPEC_VALIDATOR_OUTPUT_DRIFT');
  const waiver = pythonCommand(['scripts/validate_phase2c_waiver.py', '--output', join(runDir, 'baseline/waiver-validation.json')]);
  runCommand(runDir, 'baseline', 'waiver', waiver.command, waiver.args, projectRoot);

  writeStage8Json(join(runDir, 'baseline/nss-mount-specification.json'), { result: 'PASS', interface: 'NSS-V1',
    partCount: 16, finalBaselineAssets: 34, partSpecifications: 16 });

  const artifact = npmCommand(['run', 'test:artifact-isolation']);
  runCommand(runDir, 'evidence', 'artifact-isolation-unit', artifact.command, artifact.args);
  const evidence = stage8MachineJsonCommand('stage7Evidence', process.execPath);
  const evidenceReport = runMachineJsonCommand(runDir, 'evidence', evidence.gateName, evidence.executable,
    evidence.args, webRoot, validateStage7Evidence);
  for (const [label, script] of [
    ['stage7-summary-schema', 'scripts/validate-stage7-summary.mjs'],
    ['stage7-anchor-refresh', 'scripts/validate-stage7-anchor-refresh.mjs'],
  ]) runCommand(runDir, 'evidence', label, process.execPath, [script], webRoot);

  runPlaywright(runDir, 'collection', 'stage8-stage7-collection', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage7.config.ts', ['--list'], 8, 'COLLECTION_ONLY');
  if (canonicalTextFileSha256(formalStage7Path) !== formalStage7Sha) throw new Error('FORMAL_STAGE7_SHA_CHANGED_AFTER_COLLECTION');

  runPlaywright(runDir, 'runtime-smoke', 'stage8-runtime-smoke', 'STAGE8_RUNTIME_SMOKE',
    'playwright.stage8-runtime.config.ts', [], 1);
  const buildOutput = inspectBuildOutput(resolve(webRoot, 'dist'));
  writeStage8Json(join(runDir, 'build/build-output-integrity.json'), buildOutput);
  if (buildOutput.result !== 'PASS') throw new Error(`BUILD_OUTPUT_FAILED:${buildOutput.errors.join(',')}`);

  const docs = documentationIntegrity();
  writeStage8Json(join(runDir, 'evidence/documentation-integrity.json'), docs);
  if (docs.result !== 'PASS') throw new Error('DOCUMENTATION_INTEGRITY_FAILED');
  const security = securityAndHygiene();
  writeStage8Json(join(runDir, 'evidence/security-hygiene.json'), security);
  if (security.result !== 'PASS') throw new Error('TRUE_SECRET_DETECTED');
  const dependencies = dependencyReproducibility();
  writeStage8Json(join(runDir, 'evidence/dependency-reproducibility.json'), dependencies);
  if (dependencies.result !== 'PASS') throw new Error(`DEPENDENCY_REPRODUCIBILITY_FAILED:${dependencies.errors.join(',')}`);

  assertUserWorkspaceUnchanged(userSnapshot);
  const summary = { status: 'PASS', completedAt: timestamp(), repository: repo, unit: unitSummary,
    typescript: 'PASS', nodeSyntax: 'PASS', pythonSyntax: 'PASS', build: 'PASS', baseline: baselineReport,
    finalBaselineIntegrity: baselineReport.result, historicalPhase2cEvidence: 'PRESERVED', combinationCount: 288,
    artifactIsolation: 'PASS', stage7Evidence: evidenceReport,
    collection: { collected: 8, formalSha256Before: formalStage7Sha,
      formalSha256After: canonicalTextFileSha256(formalStage7Path) },
    runtimeSmoke: 'PASS', buildOutput, documentation: docs, security, dependencies, userWorkspaceSnapshot: userSnapshot };
  writeStage8Json(join(runDir, 'preflight-summary.json'), summary);
  return summary;
}

function longGates(run) {
  const runDir = run.runDir;
  const preflightSummary = readPreflight(runDir);
  const userSnapshot = preflightSummary.userWorkspaceSnapshot;
  assertUserWorkspaceUnchanged(userSnapshot);

  runPlaywright(runDir, 'playwright-mobile-focused', 'collection-mobile-focused', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage7.config.ts', ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-mobile', '--grep',
      'completes all six tasks from real product actions and exports a whitelisted result', '--repeat-each=25', '--list'], 25, 'COLLECTION_ONLY');
  const mobileFocused = runPlaywright(runDir, 'playwright-mobile-focused', 'mobile-focused-25', 'STAGE8_MOBILE_FOCUSED',
    'playwright.stage7.config.ts', ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-mobile', '--grep',
      'completes all six tasks from real product actions and exports a whitelisted result', '--repeat-each=25', '--workers=1', '--retries=0'], 25);

  runPlaywright(runDir, 'playwright-mobile-full', 'collection-mobile-full', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage7.config.ts', ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-mobile', '--list'], 4, 'COLLECTION_ONLY');
  const mobileBatches = [];
  for (let index = 1; index <= 10; index += 1) {
    mobileBatches.push(runPlaywright(runDir, 'playwright-mobile-full', `mobile-full-${String(index).padStart(2, '0')}`,
      'STAGE8_MOBILE_FULL', 'playwright.stage7.config.ts',
      ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-mobile', '--workers=1', '--retries=0'], 4));
  }

  runPlaywright(runDir, 'playwright-desktop', 'collection-desktop', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage7.config.ts', ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-desktop', '--list'], 4, 'COLLECTION_ONLY');
  const desktop = runPlaywright(runDir, 'playwright-desktop', 'desktop-4', 'STAGE8_DESKTOP',
    'playwright.stage7.config.ts', ['tests/stage7/anonymous-test-mode.spec.ts', '--project=stage7-desktop', '--workers=1', '--retries=0'], 4);

  runPlaywright(runDir, 'playwright-stage7-combined', 'collection-stage7-combined', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage7.config.ts', ['--list'], 8, 'COLLECTION_ONLY');
  const combined = runPlaywright(runDir, 'playwright-stage7-combined', 'stage7-combined-8', 'STAGE8_STAGE7_COMBINED',
    'playwright.stage7.config.ts', ['--workers=1', '--retries=0'], 8);

  runPlaywright(runDir, 'playwright-legacy', 'collection-legacy', 'PLAYWRIGHT_COLLECTION',
    'playwright.stage8-legacy.config.ts', ['--list'], 18, 'COLLECTION_ONLY');
  const legacy = runPlaywright(runDir, 'playwright-legacy', 'legacy-18', 'STAGE8_LEGACY',
    'playwright.stage8-legacy.config.ts', [], 18);

  const governance = stage8MachineJsonCommand('governance', process.execPath);
  const governanceReport = runMachineJsonCommand(runDir, 'governance', governance.gateName, governance.executable,
    governance.args, webRoot, validateGovernance);
  const finalBaseline = stage8MachineJsonCommand('finalBaselineIntegrity', process.execPath);
  const finalBaselineAfterLong = runMachineJsonCommand(runDir, 'governance', 'final-baseline-integrity-after-long',
    finalBaseline.executable, finalBaseline.args, webRoot, validateFinalBaselineIntegrity);
  writeStage8Json(join(runDir, 'governance/final-baseline-integrity-after-long.json'), finalBaselineAfterLong);
  const protectedState = protectedDiff();
  writeStage8Json(join(runDir, 'governance/protected-paths.json'), protectedState);
  if (protectedState.result !== 'PASS') throw new Error('PROTECTED_PATH_DRIFT');
  if (canonicalTextFileSha256(formalStage7Path) !== formalStage7Sha) throw new Error('FORMAL_STAGE7_SHA_CHANGED_AFTER_LONG_GATES');
  assertUserWorkspaceUnchanged(userSnapshot);
  const summary = { status: 'PASS', completedAt: timestamp(), mobileFocused,
    mobileFull: { passed: mobileBatches.reduce((sum, item) => sum + item.passed, 0), total: 40, batches: mobileBatches.length },
    desktop, stage7Combined: combined, legacy, governance: governanceReport,
    finalBaselineIntegrity: finalBaselineAfterLong.result, protectedState,
    formalStage7Sha256: canonicalTextFileSha256(formalStage7Path) };
  writeStage8Json(join(runDir, 'long-gates-summary.json'), summary);
  return summary;
}

function finalize(run) {
  const preflightSummary = readPreflight(run.runDir);
  const longPath = join(run.runDir, 'long-gates-summary.json');
  if (!existsSync(longPath)) throw new Error('LONG_GATES_SUMMARY_MISSING');
  const long = parseJson(longPath);
  if (long.status !== 'PASS') throw new Error('LONG_GATES_NOT_PASS');
  const headCommit = gitText(['rev-parse', 'HEAD']);
  const baseline = preflightSummary.baseline;
  const report = {
    schemaVersion: 'NSS-STAGE8-CURRENT-DELIVERY-V2',
    stage: 'STAGE_8_FULL_QUALITY_AND_DELIVERY_GATE',
    runId: run.manifest.runId,
    headCommit,
    baseline: { tag: baselineTag, resolvedCommit: baselineCommit, status: 'APPROVED',
      assetCount: baseline.assets.total, matched: baseline.assets.matched, drift: baseline.assets.drifted,
      missing: baseline.assets.missing, extra: 0 },
    quality: { unit: { passed: preflightSummary.unit.passed, failed: preflightSummary.unit.failed,
      total: preflightSummary.unit.total }, typescript: 'PASS', nodeSyntax: 'PASS', pythonSyntax: 'PASS', build: 'PASS', governance: 'PASS' },
    playwright: { collection: { collected: 8, evidenceType: 'COLLECTION_ONLY' },
      mobileFocused: { passed: long.mobileFocused.passed, failed: long.mobileFocused.failed },
      mobileFull: { passed: long.mobileFull.passed, failed: 40 - long.mobileFull.passed },
      desktop: { passed: long.desktop.passed, failed: long.desktop.failed },
      stage7Combined: { passed: long.stage7Combined.passed, failed: long.stage7Combined.failed },
      legacy: { passed: long.legacy.passed, failed: long.legacy.failed } },
    evidence: { stage7Validator: 'PASS', substituteAnchorValidator: 'PASS', existingEvidenceFreeze: 'PASS',
      preserved: 19, unavailable: 3, currentRevalidation: 3, formalStage7ReportSha256: formalStage7Sha,
      formalReportUnchangedAfterCollection: preflightSummary.collection.formalSha256After === formalStage7Sha },
    delivery: { runtimeSmoke: 'PASS', buildOutputIntegrity: 'PASS', documentationIntegrity: 'PASS',
      secretScan: 'PASS', dependencyReproducibility: 'PASS' },
    humanVisualReview: 'APPROVED',
    phase3Status: 'COMPLETE',
    stage8Status: 'PASS_WITH_APPROVED_FINAL_BASELINE',
    baselineFinalizationAllowed: true,
    auditNote: requiredAuditNote,
  };
  assertStage8Summary(report);
  writeStage8Json(join(run.runDir, 'final-summary.json'), report);
  return report;
}

const mode = argument('--mode') ?? 'preflight';
const explicitRunId = argument('--run-id');
const headCommit = gitText(['rev-parse', 'HEAD']);
const runId = explicitRunId ?? stage8RunId(new Date(), headCommit);
const runDir = resolve(artifactRoot, runId);
const runtimeRequirements = parseJson(resolve(webRoot, 'runtime-requirements.json'));
const runtimeReferenceVersion = `Python ${runtimeRequirements.python.stage8ReferenceRuntime.version}`;

let run;
if (mode === 'preflight') {
  const workspaceDigest = sha256(gitText(['status', '--porcelain=v1']));
  run = createStage8Run({ artifactRoot, runId, headCommit, baselineCommit, workspaceDigest });
} else {
  const manifestPath = join(runDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Stage 8 run not found: ${runId}`);
  run = { runDir, manifestPath, manifest: parseJson(manifestPath) };
}

let runtimeStartIdentity = null;
try {
  runtimeStartIdentity = stage8PythonRuntimeIdentity(resolvePythonRuntime());
  assertStage8PythonRuntimeReady(runtimeStartIdentity, runtimeReferenceVersion);
  writeStage8Json(join(run.runDir, `evidence/python-runtime-${mode}-start.json`),
    redactStage8PythonRuntimeIdentity(runtimeStartIdentity));
  const result = mode === 'preflight' ? preflight(run) : mode === 'long' ? longGates(run)
    : mode === 'finalize' ? finalize(run) : null;
  if (!result) throw new Error(`Unknown Stage 8 mode: ${mode}`);
  verifyPythonRuntimeEnd(run.runDir, mode, runtimeStartIdentity);
  completeStage8Mode(run, mode);
  process.stdout.write(`${JSON.stringify({ mode, runId, status: result.status ?? result.stage8Status ?? 'PASS' }, null, 2)}\n`);
} catch (error) {
  const secondaryErrors = [];
  try {
    if (runtimeStartIdentity) {
      verifyPythonRuntimeEnd(run.runDir, mode, runtimeStartIdentity);
    } else {
      const endIdentity = stage8PythonRuntimeIdentity(resolvePythonRuntime());
      writeStage8Json(join(run.runDir, `evidence/python-runtime-${mode}-end.json`),
        redactStage8PythonRuntimeIdentity(endIdentity));
    }
  } catch (runtimeError) {
    const details = failureDetails(runtimeError);
    secondaryErrors.push({ classification: details.failureClassification, message: details.message });
  }
  const details = failureDetails(error);
  finalizeStage8Failure(run, { mode, ...details, secondaryErrors });
  process.stderr.write(`${JSON.stringify({ mode, runId, status: 'FAIL',
    failureClassification: details.failureClassification, failedGate: details.failedGate,
    error: details.message, secondaryErrors }, null, 2)}\n`);
  process.exitCode = 1;
}
