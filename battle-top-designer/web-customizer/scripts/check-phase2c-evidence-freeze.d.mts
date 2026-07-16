export interface EvidenceFreezeFacts {
  baselineTagResolved: boolean;
  baselineTagMatchesAnchor: boolean;
  baselineAssetsValid: boolean;
  evidenceCommitResolved: boolean;
  evidenceCommitIsAncestor: boolean;
  reportsPresent: boolean;
  reportsMatchEvidenceCommit: boolean;
  reportsCleanInWorktree: boolean;
  reportsCleanInIndex: boolean;
  baselineProtectedPathsCleanInWorktree?: boolean;
  baselineProtectedPathsCleanInIndex?: boolean;
}

export interface EvidenceFreezeEvaluation {
  result: 'PASS' | 'FAIL';
  errors: string[];
}

export function evaluateEvidenceFreeze(input: EvidenceFreezeFacts): EvidenceFreezeEvaluation;
