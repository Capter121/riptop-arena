import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FORMAL_STAGE7_SHA256, formalStage7Facts, isFormalStage7Report, readGitBlob, sha256Buffer,
} from './stage7-evidence-guards.mjs';

export const sourceCommit = '5770180a0422d977519de6d536577a6d5c8a1d40';
export const sourceBlob = '9371800c1ff08a9117d8b2b4d1d97e42d1c56ba2';
export const reportPath = 'battle-top-designer/reports/validation/phase3b-stage7-playwright-repaired-v2.json';

export function restoreFormalStage7Report({ destination = resolve('../reports/validation/phase3b-stage7-playwright-repaired-v2.json') } = {}) {
  const bytes = readGitBlob(sourceCommit, reportPath);
  const sha256 = sha256Buffer(bytes);
  const report = JSON.parse(bytes.toString('utf8'));
  if (sha256 !== FORMAL_STAGE7_SHA256) throw new Error(`Formal report SHA-256 mismatch: ${sha256}`);
  if (!isFormalStage7Report(report)) throw new Error(`Git blob is not the formal 8/8 report: ${JSON.stringify(formalStage7Facts(report))}`);
  writeFileSync(destination, bytes);
  return { sourceCommit, sourceBlob, sha256, facts: formalStage7Facts(report), historicalRunReexecuted: false };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  console.log(JSON.stringify(restoreFormalStage7Report(), null, 2));
}
