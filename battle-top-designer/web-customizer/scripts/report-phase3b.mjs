import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readJson, validateBrowserReport, validateProtectedEnvironment } from './report-phase-validation.mjs';

const project = resolve(import.meta.dirname, '../..');
const app = resolve(project, 'web-customizer');
const validationDir = resolve(project, 'reports/validation');
const notices = [
  'Human visual review remains pending.',
  'Development continued under a documented provisional internal-prototype decision.',
];

export const createPhase3bMachineReport = (validation, environment = { overallPassed: true }) => ({
  ...validation,
  overallPassed: validation.browserPassed && environment.overallPassed,
  governancePassed: environment.governancePassed ?? true,
  assetErrors: environment.assetErrors ?? [],
  protectedDiff: environment.protectedDiff ?? [],
  visualReviewStatus: 'Phase 2B visual review deferred pending real reviewers',
  baselineStatus: 'PROVISIONAL_NOT_FINAL',
  notices,
});

export const main = async () => {
  const manifest = await readJson(resolve(app, 'validation-manifests/phase3b-browser-suite.json'));
  const browser = await readJson(resolve(app, 'test-results/phase3a-browser-test.json'));
  const validation = validateBrowserReport({ manifest, report: browser, phase: 'phase3b' });
  const environment = await validateProtectedEnvironment({ project, app, validationDir });
  const report = createPhase3bMachineReport(validation, environment);
  const output = resolve(validationDir, 'phase3b-browser-validation.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.overallPassed) throw new Error(`Phase 3B report gate failed: ${JSON.stringify(report)}`);
  console.log(JSON.stringify({ result: 'PASS', output: 'reports/validation/phase3b-browser-validation.json', expectedTests: report.expectedTests }, null, 2));
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
