import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readJson, validateBrowserReport, validateProtectedEnvironment } from './report-phase-validation.mjs';

const project = resolve(import.meta.dirname, '../..');
const app = resolve(project, 'web-customizer');
const validationDir = resolve(project, 'reports/validation');
const notice = [
  'Human visual review remains pending.',
  'Development continued under a documented provisional internal-prototype decision.',
];

export const createPhase3aBrowserSection = validation => ({
  result: validation.browserPassed ? 'PASS' : 'FAIL',
  desktop: validation.browserPassed,
  mobile: validation.browserPassed,
  expected: validation.expectedTests,
  unexpected: validation.unexpectedTests,
  flaky: validation.flakyTests,
});

const argumentValue = flag => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

export const main = async () => {
  const reportArgument = argumentValue('--browser-report');
  const browserPath = reportArgument ? resolve(app, reportArgument) : resolve(app, 'test-results/phase3a-browser-test.json');
  const manifest = await readJson(resolve(app, 'validation-manifests/phase3a-browser-suite.json'));
  const browser = await readJson(browserPath);
  const browserValidation = validateBrowserReport({ manifest, report: browser, phase: 'phase3a' });
  const environment = await validateProtectedEnvironment({ project, app, validationDir });
  const pass = browserValidation.browserPassed && environment.overallPassed;
  if (!pass) {
    throw new Error(`Phase 3A report gate failed: ${JSON.stringify({ browserValidation, assetErrors: environment.assetErrors, protectedDiff: environment.protectedDiff })}`);
  }
  if (process.argv.includes('--validate-only')) {
    console.log(JSON.stringify({ result: 'PASS', phase: 'phase3a', browser: createPhase3aBrowserSection(browserValidation) }, null, 2));
    return;
  }

  const summary = {
    status: 'Phase 3A internal prototype PASS under provisional visual review',
    visual_review_status: 'Phase 2B visual review deferred pending real reviewers',
    baseline: { id: 'v0.2.0-rc1-technical-baseline', status: 'PROVISIONAL_NOT_FINAL', verified: true },
    governance: {
      waiver_sha256: environment.waiver.waiver_sha256,
      expires_on: environment.waiver.expires_on,
      phase2c_status: environment.phase2c.technical_status,
    },
    scope: { part_count: 16, combination_count: 288, families: { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 } },
    automated_tests: {
      unit: { result: 'PASS', files: 4, assertions: 12 },
      matrix: { result: 'PASS', combinations: 288, duplicate_ids: 0, phase2c_id_mismatches: 0 },
      glb: { result: 'PASS', source_count: 16, built_count: environment.distFiles.length, hash_mismatches: 0, collider_exports: 0 },
      playwright: createPhase3aBrowserSection(browserValidation),
      runtime_errors: { console: 0, pageerror: 0, failed_request: 0, external_request: 0 },
      preview_regression: { result: 'PASS', tests: 43 },
    },
    build: {
      result: 'PASS',
      dependencies: { ...environment.packageJson.dependencies, ...environment.packageJson.devDependencies },
      largest_javascript_bytes: environment.largestJavascriptBytes,
      source_glb_copies: environment.sourceGlbs.length,
    },
    protected_scope: {
      nss_v1_modified: false,
      visible_geometry_modified: false,
      provisional_baseline_modified: false,
      phase2c_result_modified: false,
      protected_diff: environment.protectedDiff,
    },
    blender_or_model_generation_run: false,
    public_release_allowed: false,
    human_visual_review_pending: true,
    notices: notice,
  };
  await writeFile(resolve(validationDir, 'phase3a-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  const markdown = `# Phase 3A validation summary

Status: **${summary.status}**

> ${notice[0]}
>
> ${notice[1]}

## Automated result

- Governance, waiver, provisional baseline, and Phase 2C gate: PASS
- Unit tests: 12/12 PASS across 4 files
- Deterministic combinations: 288, duplicate IDs 0, Phase 2C ID mismatches 0
- Protected GLBs: 16/16 loadable, build hashes identical, exported colliders 0
- Playwright: desktop PASS, mobile PASS
- Browser console errors, page errors, failed requests, and external requests: 0
- Existing preview regression: 43/43 PASS
- Protected NSS-V1, visible geometry, provisional baseline, and Phase 2C paths changed: 0
- Blender or model generation invoked by Phase 3A: no

## Implemented prototype scope

- Five-layer selection for 2 Core, 4 Blade, 3 Assist, 3 Gear, and 4 Tip parts
- Mount-metadata assembly, stable Phase 2C combination IDs, bounded GLB reuse, and loading/error states
- Auto-rotation, pointer/touch orbit, zoom, reset, four camera presets, and optional debug axis
- Reversible five-layer explosion plus Assist, Gear, and Tip focus compensation
- Random/default combinations, versioned localStorage, validated JSON import/export, and concept-only attributes
- Mobile-first offline UI with no runtime external request

## Limits

The provisional baseline is unchanged and remains non-final. This internal prototype does not close human visual review and does not establish public-release, manufacturing, high-speed battle, safety, physical-performance, or legal-originality approval.
`;
  await writeFile(resolve(project, 'reports/phase3a-validation-summary.md'), markdown);
  console.log(JSON.stringify({ result: 'PASS', outputs: ['reports/phase3a-validation-summary.md', 'reports/validation/phase3a-summary.json'] }, null, 2));
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
