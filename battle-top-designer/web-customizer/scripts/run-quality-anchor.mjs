import { executeQualityAnchor } from './quality-anchor.mjs';

const index = process.argv.indexOf('--run-id');
const runId = index === -1 ? undefined : process.argv[index + 1];
const result = executeQualityAnchor({ runId });
process.stdout.write(`${JSON.stringify({ runId: result.manifest.runId, status: result.manifest.status,
  unitTestSummary: result.manifest.unitTestSummary, typecheckSummary: result.manifest.typecheckSummary,
  buildSummary: result.manifest.buildSummary, workspaceDigestUnchanged:
    result.manifest.workspaceDigestBefore === result.manifest.workspaceDigestAfter }, null, 2)}\n`);
