import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const audit = JSON.parse(readFileSync(resolve('../reports/validation/phase3b-stage7-substitute-anchor-refresh.json'), 'utf8'));

describe('Stage 7 substitute anchor refresh audit', () => {
  it('retains both anchors and the approved producer', () => {
    expect(audit).toMatchObject({
      previousSha256: '6349b23de536ffaba88bdd5686043a96230f20e371207d71481186ff8ee33a00',
      currentSha256: '3fa6f4d203d95fc6e59a2740caa831bcfba4aa2ae65bc2b136ab9716440080bf',
      producerCommit: '2f967e8f15f0b3eaf231d239900888441d141f56',
      changeReason: 'VERIFIER_RUNTIME_CLASSIFICATION_SCHEMA_UPGRADE',
      approvedBy: 'PROJECT_OWNER',
    });
  });

  it('does not claim a changed baseline or recovered history', () => {
    expect(audit).toMatchObject({
      baselineIdentityUnchanged: true,
      assetSetUnchanged: true,
      assetHashesUnchanged: true,
      historicalEvidenceRecovered: false,
    });
  });
});
