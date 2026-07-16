import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROVISIONAL_BASELINE_TAG = 'v0.2.0-rc1-technical-baseline';
export const PROVISIONAL_BASELINE_TAG_OBJECT = '4a7a6895d5d3bb6608a4178d8f9d8373f8e3a07f';
export const PROVISIONAL_BASELINE_COMMIT = '5951ecab40eb4d58ef502fded23b13fa04292429';
export const PHASE2C_EVIDENCE_COMMIT = '9590780e04c0141ea57109a2feb865ebafed07dd';
export const PHASE2C_REPORTS = [
  'reports/validation/phase2c-final-gate.json',
  'reports/validation/phase2c-combination-matrix.json',
];

const BASELINE_PROTECTED_PATHS = [
  'specs',
  'public/models',
  'docs/baselines/v0.2.0-rc1-technical-baseline.json',
  'docs/baselines/v0.2.0-rc1-technical-baseline.md',
];

export function evaluateEvidenceFreeze(input) {
  const errors = [];
  if (!input.baselineTagResolved) errors.push('PROVISIONAL_BASELINE_TAG_UNRESOLVED');
  if (input.baselineTagResolved && !input.baselineTagMatchesAnchor) errors.push('PROVISIONAL_BASELINE_TAG_MOVED');
  if (!input.baselineAssetsValid) errors.push('PROVISIONAL_BASELINE_ASSET_DRIFT');
  if (!input.evidenceCommitResolved) errors.push('PHASE2C_EVIDENCE_COMMIT_UNRESOLVED');
  if (input.evidenceCommitResolved && !input.evidenceCommitIsAncestor) errors.push('PHASE2C_EVIDENCE_COMMIT_NOT_ANCESTOR');
  if (!input.reportsPresent) errors.push('PHASE2C_EVIDENCE_REPORT_MISSING');
  if (!input.reportsMatchEvidenceCommit) errors.push('PHASE2C_EVIDENCE_REPORT_DRIFT');
  if (!input.reportsCleanInWorktree) errors.push('PHASE2C_EVIDENCE_REPORT_WORKTREE_DIRTY');
  if (!input.reportsCleanInIndex) errors.push('PHASE2C_EVIDENCE_REPORT_INDEX_DIRTY');
  if (input.baselineProtectedPathsCleanInWorktree === false) errors.push('PROVISIONAL_BASELINE_WORKTREE_DIRTY');
  if (input.baselineProtectedPathsCleanInIndex === false) errors.push('PROVISIONAL_BASELINE_INDEX_DIRTY');
  return { result: errors.length ? 'FAIL' : 'PASS', errors };
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
}

function git(args, cwd) {
  return run('git', args, cwd);
}

function resolvedCommit(revision, cwd) {
  const result = git(['rev-parse', '--verify', `${revision}^{commit}`], cwd);
  return result.status === 0 ? result.stdout.trim() : null;
}

function cleanDiff(args, cwd) {
  return git(['diff', '--quiet', ...args], cwd).status === 0;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function inspectEvidenceFreeze(projectRoot) {
  const baselineTagObject = git(['rev-parse', '--verify', PROVISIONAL_BASELINE_TAG], projectRoot);
  const baselineTagObjectId = baselineTagObject.status === 0 ? baselineTagObject.stdout.trim() : null;
  const baselineCommit = resolvedCommit(PROVISIONAL_BASELINE_TAG, projectRoot);
  const evidenceCommit = resolvedCommit(PHASE2C_EVIDENCE_COMMIT, projectRoot);
  const head = resolvedCommit('HEAD', projectRoot);
  const baselineVerify = run('python', ['scripts/manage_phase2c_provisional_baseline.py', 'verify'], projectRoot);
  const evidenceAncestor = evidenceCommit
    ? git(['merge-base', '--is-ancestor', PHASE2C_EVIDENCE_COMMIT, 'HEAD'], projectRoot).status === 0
    : false;
  const reportPaths = PHASE2C_REPORTS.map(path => resolve(projectRoot, path));
  const reportsPresent = reportPaths.every(path => {
    try {
      return statSync(path).isFile() && statSync(path).size > 0;
    } catch {
      return false;
    }
  });
  const facts = {
    baselineTagResolved: baselineTagObjectId !== null && baselineCommit !== null,
    baselineTagMatchesAnchor: baselineTagObjectId === PROVISIONAL_BASELINE_TAG_OBJECT
      && baselineCommit === PROVISIONAL_BASELINE_COMMIT,
    baselineAssetsValid: baselineVerify.status === 0,
    evidenceCommitResolved: evidenceCommit !== null,
    evidenceCommitIsAncestor: evidenceAncestor,
    reportsPresent,
    reportsMatchEvidenceCommit: evidenceCommit !== null
      && cleanDiff([PHASE2C_EVIDENCE_COMMIT, 'HEAD', '--', ...PHASE2C_REPORTS], projectRoot),
    reportsCleanInWorktree: cleanDiff(['--', ...PHASE2C_REPORTS], projectRoot),
    reportsCleanInIndex: cleanDiff(['--cached', '--', ...PHASE2C_REPORTS], projectRoot),
    baselineProtectedPathsCleanInWorktree: cleanDiff(['--', ...BASELINE_PROTECTED_PATHS], projectRoot),
    baselineProtectedPathsCleanInIndex: cleanDiff(['--cached', '--', ...BASELINE_PROTECTED_PATHS], projectRoot),
  };
  const evaluation = evaluateEvidenceFreeze(facts);
  return {
    ...evaluation,
    provisional_baseline_tag: PROVISIONAL_BASELINE_TAG,
    provisional_baseline_tag_object: baselineTagObjectId,
    provisional_baseline_commit: baselineCommit,
    phase2c_evidence_commit: evidenceCommit,
    current_head: head,
    evidence_commit_is_head_ancestor: evidenceAncestor,
    reports_unchanged_since_evidence_commit: facts.reportsMatchEvidenceCommit,
    reports_clean_in_worktree: facts.reportsCleanInWorktree,
    reports_clean_in_index: facts.reportsCleanInIndex,
    baseline_status: 'PROVISIONAL_NOT_FINAL',
    visual_review_status: 'Phase 2B visual review deferred pending real reviewers',
    reports: PHASE2C_REPORTS.map((path, index) => ({
      path,
      sha256: reportsPresent ? sha256(reportPaths[index]) : null,
    })),
    gates: {
      provisional_baseline_assets: facts.baselineAssetsValid ? 'PASS' : 'FAIL',
      phase2c_evidence: facts.evidenceCommitResolved && facts.evidenceCommitIsAncestor
        && facts.reportsPresent && facts.reportsMatchEvidenceCommit ? 'PASS' : 'FAIL',
      protected_worktree: facts.reportsCleanInWorktree && facts.reportsCleanInIndex
        && facts.baselineProtectedPathsCleanInWorktree && facts.baselineProtectedPathsCleanInIndex ? 'PASS' : 'FAIL',
    },
    audit_note: 'Human visual review remains pending. Technical continuation was authorized by documented provisional exception, not by fabricated review data.',
  };
}

function main() {
  const projectRoot = resolve(import.meta.dirname, '../..');
  const report = inspectEvidenceFreeze(projectRoot);
  if (process.argv.includes('--write-record')) {
    writeFileSync(
      resolve(projectRoot, 'reports/validation/phase2c-evidence-freeze.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
