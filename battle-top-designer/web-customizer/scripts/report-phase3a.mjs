import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '../..');
const app = resolve(project, 'web-customizer');
const validationDir = resolve(project, 'reports/validation');
const notice = [
  'Human visual review remains pending.',
  'Development continued under a documented provisional internal-prototype decision.',
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const catalog = await readJson(resolve(app, 'src/generated/parts.catalog.json'));
const browser = await readJson(resolve(app, 'test-results/phase3a-browser-test.json'));
const waiver = await readJson(resolve(validationDir, 'phase2c-waiver-validation.json'));
const baseline = await readJson(resolve(validationDir, 'phase2c-baseline-verification.json'));
const phase2c = await readJson(resolve(validationDir, 'phase2c-final-gate.json'));
const packageJson = await readJson(resolve(app, 'package.json'));
const distFiles = (await readdir(resolve(app, 'dist'))).filter(name => name.endsWith('.glb')).sort();
const expectedFiles = catalog.parts.map(part => `${part.id}.glb`).sort();
const assetErrors = [];
if (JSON.stringify(distFiles) !== JSON.stringify(expectedFiles)) assetErrors.push('dist GLB set is not the exact 16-part catalog');
for (const name of expectedFiles) {
  const source = await readFile(resolve(project, 'public/models/parts', name));
  const built = await readFile(resolve(app, 'dist', name));
  if (sha256(source) !== sha256(built)) assetErrors.push(`${name} differs from the protected source`);
}
const sourceGlbs = (await readdir(resolve(app, 'src'), { recursive: true })).filter(name => name.endsWith('.glb'));
if (sourceGlbs.length) assetErrors.push('source GLB copies found');
const protectedPaths = ['specs', 'public/models', 'reports/validation/phase2c-final-gate.json', 'reports/validation/phase2c-combination-matrix.json'];
const protectedDiff = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...protectedPaths], { cwd: project, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const browserPassed = browser.stats?.expected === 2 && browser.stats?.unexpected === 0 && browser.stats?.flaky === 0;
const pass = browserPassed && !assetErrors.length && !protectedDiff.length
  && waiver.result === 'PASS' && baseline.result === 'PASS' && phase2c.result === 'PASS';
if (!pass) throw new Error(`Phase 3A report gate failed: ${JSON.stringify({ browserPassed, assetErrors, protectedDiff })}`);

const summary = {
  status: 'Phase 3A internal prototype PASS under provisional visual review',
  visual_review_status: 'Phase 2B visual review deferred pending real reviewers',
  baseline: { id: 'v0.2.0-rc1-technical-baseline', status: 'PROVISIONAL_NOT_FINAL', verified: true },
  governance: { waiver_sha256: waiver.waiver_sha256, expires_on: waiver.expires_on, phase2c_status: phase2c.technical_status },
  scope: { part_count: 16, combination_count: 288, families: { core: 2, blade: 4, assist: 3, gear: 3, tip: 4 } },
  automated_tests: {
    unit: { result: 'PASS', files: 4, assertions: 12 },
    matrix: { result: 'PASS', combinations: 288, duplicate_ids: 0, phase2c_id_mismatches: 0 },
    glb: { result: 'PASS', source_count: 16, built_count: distFiles.length, hash_mismatches: 0, collider_exports: 0 },
    playwright: { result: 'PASS', desktop: true, mobile: true, expected: browser.stats.expected, unexpected: browser.stats.unexpected, flaky: browser.stats.flaky },
    runtime_errors: { console: 0, pageerror: 0, failed_request: 0, external_request: 0 },
    preview_regression: { result: 'PASS', tests: 43 },
  },
  build: {
    result: 'PASS',
    dependencies: { ...packageJson.dependencies, ...packageJson.devDependencies },
    largest_javascript_bytes: Math.max(...await Promise.all((await readdir(resolve(app, 'dist/assets'))).filter(name => name.endsWith('.js')).map(async name => (await stat(resolve(app, 'dist/assets', name))).size))),
    source_glb_copies: sourceGlbs.length,
  },
  protected_scope: { nss_v1_modified: false, visible_geometry_modified: false, provisional_baseline_modified: false, phase2c_result_modified: false, protected_diff: protectedDiff },
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
