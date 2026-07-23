import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FINAL_BASELINE_TAG = 'v0.3.0-final-visual-baseline';
export const FINAL_BASELINE_TAG_OBJECT = 'c81b2604b6f3ed385078bbf40bdc5d6fd470e2c6';
export const FINAL_BASELINE_TAG_COMMIT = 'dae1c5104485373d2ff3c603aba48e27eef10754';
export const FINAL_BASELINE_HEAD = '94dcdb931fa3f3ab21c1b163509d92a65c23f061';
export const FORMAL_STAGE7_SHA256 = '16b74303ffc08a9bc8f9d1c1a0bcc4734d49c154d63e26e7d2771b6a0734c8cc';
export const PHASE2C_EVIDENCE_COMMIT = '9590780e04c0141ea57109a2feb865ebafed07dd';

const PHASE2C_REPORTS = [
  'reports/validation/phase2c-final-gate.json',
  'reports/validation/phase2c-combination-matrix.json',
];
const BASELINE_ASSET_TEXT_PATHS = [
  'specs/interfaces.json',
  'specs/materials.json',
];
const BASELINE_GOVERNANCE_PATHS = [
  'reports/baseline/final-baseline-manifest.json',
  'reports/baseline/final-baseline-decision.md',
];
const NORMAL_REPAIR_PATH = 'reports/validation/phase3c-stage4b-normal-buffer-repair.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalText(value) {
  return Buffer.from(value.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
}

function git(cwd, args, options = {}) {
  return spawnSync('git', args, { cwd, encoding: options.encoding ?? 'utf8', windowsHide: true });
}

function gitText(cwd, args) {
  const result = git(cwd, args);
  if (result.status !== 0) throw new Error(String(result.stderr || `git ${args.join(' ')} failed`).trim());
  return result.stdout.trim();
}

export function evaluateFinalBaselineIntegrity(input) {
  const errors = [];
  if (!input.tagResolved) errors.push('FINAL_BASELINE_TAG_UNRESOLVED');
  if (input.tagResolved && !input.tagMatchesAuthority) errors.push('FINAL_BASELINE_TAG_MOVED');
  if (!input.finalBaselineHeadResolved) errors.push('FINAL_BASELINE_HEAD_UNRESOLVED');
  if (input.finalBaselineHeadResolved && !input.finalBaselineIsAncestor) errors.push('FINAL_BASELINE_NOT_ANCESTOR');
  if (!input.manifestValid) errors.push('FINAL_BASELINE_MANIFEST_INVALID');
  if (!input.historicalEvidenceValid) errors.push('HISTORICAL_EVIDENCE_DRIFT');
  if (!input.protectedWorktreeClean) errors.push('FINAL_BASELINE_PROTECTED_WORKTREE_DIRTY');
  if (!input.protectedIndexClean) errors.push('FINAL_BASELINE_PROTECTED_INDEX_DIRTY');
  if (input.assetCount !== 34) errors.push('FINAL_BASELINE_ASSET_COUNT_INVALID');
  if (input.matched !== input.assetCount || input.drifted !== 0 || input.missing !== 0) {
    errors.push('FINAL_BASELINE_ASSET_DRIFT');
  }
  if (!input.normalRepairValid) errors.push('FINAL_GLB_NORMAL_REPAIR_CONTRACT_INVALID');
  if (!input.catalogValid) errors.push('FINAL_BASELINE_CATALOG_INVALID');
  return { result: errors.length ? 'FAIL' : 'PASS', errors };
}

export function inspectFinalBaselineIntegrity(projectRoot) {
  const tagObject = gitText(projectRoot, ['rev-parse', FINAL_BASELINE_TAG]);
  const tagCommit = gitText(projectRoot, ['rev-parse', `${FINAL_BASELINE_TAG}^{commit}`]);
  const headResolved = git(projectRoot, ['cat-file', '-e', `${FINAL_BASELINE_HEAD}^{commit}`]).status === 0;
  const headIsAncestor = headResolved
    && git(projectRoot, ['merge-base', '--is-ancestor', FINAL_BASELINE_HEAD, 'HEAD']).status === 0;
  const partNames = readdirSync(resolve(projectRoot, 'specs/parts'))
    .filter(name => name.endsWith('.json')).sort();
  const protectedAssets = [
    ...BASELINE_ASSET_TEXT_PATHS.map(path => ({ path })),
    ...partNames.map(name => ({ path: `specs/parts/${name}` })),
    ...partNames.map(name => ({ path: `public/models/parts/${name.replace(/\.json$/, '.glb')}` })),
  ];
  const protectedPaths = protectedAssets.map(asset => asset.path);
  const changedFromBaseline = new Set(gitText(projectRoot, [
    'diff', '--name-only', FINAL_BASELINE_HEAD, 'HEAD', '--', ...protectedPaths,
  ]).split(/\r?\n/).filter(Boolean).map(path => path.replace(/^battle-top-designer\//, '')));
  const assetRecords = protectedAssets.map(asset => ({
    path: asset.path,
    status: existsSync(resolve(projectRoot, asset.path)) && !changedFromBaseline.has(asset.path) ? 'MATCH' : 'DRIFT',
  }));
  const missing = assetRecords.filter(asset => !existsSync(resolve(projectRoot, asset.path))).length;
  const drifted = assetRecords.filter(asset => asset.status !== 'MATCH').length;
  const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'reports/baseline/final-baseline-manifest.json'), 'utf8'));
  const manifestValid = git(projectRoot, [
    'diff', '--quiet', FINAL_BASELINE_TAG_COMMIT, 'HEAD', '--', ...BASELINE_GOVERNANCE_PATHS,
  ]).status === 0
    && git(projectRoot, ['diff', '--quiet', FINAL_BASELINE_HEAD, 'HEAD', '--', NORMAL_REPAIR_PATH]).status === 0
    && manifest.baselineStatus === 'APPROVED'
    && manifest.finalBaselineHead === FINAL_BASELINE_HEAD
    && manifest.formalStage8Status === 'PASS'
    && manifest.formalStage8ArtifactHashMismatches === 0
    && manifest.humanVisualReviewStatus === 'APPROVED'
    && manifest.releaseTag === FINAL_BASELINE_TAG;
  const stage7Path = resolve(projectRoot, 'reports/validation/phase3b-stage7-playwright-repaired-v2.json');
  const stage7Sha = sha256(canonicalText(readFileSync(stage7Path)));
  const phase2cUnchanged = git(projectRoot, ['diff', '--quiet', PHASE2C_EVIDENCE_COMMIT, 'HEAD', '--', ...PHASE2C_REPORTS]).status === 0;
  const historyClean = git(projectRoot, ['diff', '--quiet', '--', ...PHASE2C_REPORTS]).status === 0
    && git(projectRoot, ['diff', '--cached', '--quiet', '--', ...PHASE2C_REPORTS]).status === 0;
  const protectedWorktreeClean = git(projectRoot, ['diff', '--quiet', '--', ...protectedPaths]).status === 0;
  const protectedIndexClean = git(projectRoot, ['diff', '--cached', '--quiet', '--', ...protectedPaths]).status === 0;
  const normalReport = JSON.parse(readFileSync(resolve(projectRoot, 'reports/validation/phase3c-stage4b-normal-buffer-repair.json'), 'utf8'));
  const normalHashes = new Map((normalReport.assets ?? []).map(asset => [asset.asset, asset.output_sha256]));
  const normalRepairValid = normalReport.result === 'PASS' && normalHashes.size === 16
    && partNames.every(name => {
      const id = name.replace(/\.json$/, '');
      const glb = resolve(projectRoot, `public/models/parts/${id}.glb`);
      return normalHashes.get(id) === sha256(readFileSync(glb));
    });
  const catalogs = [
    resolve(projectRoot, 'shared/nss/parts.catalog.json'),
    resolve(projectRoot, 'web-customizer/src/generated/parts.catalog.json'),
  ].map(path => JSON.parse(readFileSync(path, 'utf8')));
  const catalogValid = catalogs.every(catalog => catalog.schemaVersion === 1 && catalog.parts?.length === 16)
    && JSON.stringify(catalogs[0]) === JSON.stringify(catalogs[1])
    && catalogs[0].parts.every(part => {
      const spec = canonicalText(readFileSync(resolve(projectRoot, `specs/parts/${part.id}.json`)));
      return part.interfaceId === 'NSS-V1' && part.specSha256 === sha256(spec);
    });
  const facts = {
    tagResolved: Boolean(tagObject && tagCommit),
    tagMatchesAuthority: tagObject === FINAL_BASELINE_TAG_OBJECT && tagCommit === FINAL_BASELINE_TAG_COMMIT,
    finalBaselineHeadResolved: headResolved,
    finalBaselineIsAncestor: headIsAncestor,
    manifestValid,
    historicalEvidenceValid: stage7Sha === FORMAL_STAGE7_SHA256 && phase2cUnchanged && historyClean,
    protectedWorktreeClean,
    protectedIndexClean,
    assetCount: assetRecords.length,
    matched: assetRecords.length - drifted,
    drifted,
    missing,
    normalRepairValid,
    catalogValid,
  };
  const evaluation = evaluateFinalBaselineIntegrity(facts);
  return {
    ...evaluation,
    baseline: {
      tag: FINAL_BASELINE_TAG,
      tagObject,
      tagCommit,
      finalBaselineHead: FINAL_BASELINE_HEAD,
      status: manifest.baselineStatus,
      humanVisualReview: manifest.humanVisualReviewStatus,
    },
    assets: { total: facts.assetCount, matched: facts.matched, drifted, missing, entries: assetRecords },
    catalog: { result: catalogValid ? 'PASS' : 'FAIL', partCount: catalogs[0].parts?.length ?? 0, combinations: 288 },
    normalRepair: { result: normalRepairValid ? 'PASS' : 'FAIL', partCount: normalHashes.size },
    historicalEvidence: {
      result: facts.historicalEvidenceValid ? 'PASS' : 'FAIL',
      formalStage7Sha256: stage7Sha,
      phase2cReportsUnchanged: phase2cUnchanged,
    },
  };
}

function main() {
  const projectRoot = resolve(import.meta.dirname, '../..');
  const report = inspectFinalBaselineIntegrity(projectRoot);
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
