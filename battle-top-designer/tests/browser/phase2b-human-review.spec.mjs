import playwrightTest from '../../preview/node_modules/@playwright/test/index.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const families = {
  'core-family': ['core_solar_wolf', 'core_void_falcon'],
  'blade-family': ['blade_storm_fang', 'blade_iron_bastion', 'blade_orbit_halo', 'blade_dual_comet'],
  'assist-family': ['assist_heavy', 'assist_guard', 'assist_air'],
  'gear-family': ['gear_low', 'gear_medium', 'gear_high'],
  'tip-family': ['tip_flat_attack', 'tip_ball_defense', 'tip_needle_stamina', 'tip_taper_balance'],
};
const assemblies = [
  'assembly_phase2b_attack_representative',
  'assembly_phase2b_defense_representative',
  'assembly_phase2b_stamina_representative',
  'assembly_phase2b_balance_representative',
];
const targets = [
  ...Object.entries(families).flatMap(([family, models]) => models.map(model => ({ model, family }))),
  ...assemblies.map(model => ({ model, family: 'assemblies' })),
];
const { test, expect } = playwrightTest;
const records = [];

test.afterAll(async () => {
  const representativeRecords = records.filter(record => assemblies.includes(record.model_id));
  const technicalIssueCount = representativeRecords.reduce((total, record) => total
    + record.errors.console.length + record.errors.page.length + record.errors.requests.length
    + record.errors.external.length + record.diagnostics.missingNormalMeshes, 0);
  const report = {
    result: records.length === targets.length && technicalIssueCount === 0 ? 'PASS' : 'FAIL',
    scope: 'four Phase 2B representative assemblies',
    automatic_checks: [
      'offline loading', 'console errors', 'page errors', 'failed requests', 'external requests',
      'mesh normals present', 'material and transparent-material counts', 'WebGL draw calls',
    ],
    human_review_required: ['metal highlight quality', 'plastic hierarchy', 'transparent sorting', 'depth conflict', 'small-size material readability'],
    technical_issue_count: technicalIssueCount,
    assemblies: representativeRecords,
  };
  await writeFile(resolve('../reports/validation/phase2b-material-review.json'), `${JSON.stringify(report, null, 2)}\n`);
});

for (const { model, family } of targets) {
  test(`${model} human-review browser capture`, async ({ page }) => {
    const errors = { console: [], page: [], requests: [], external: [] };
    page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('requestfailed', request => errors.requests.push(request.url()));
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) errors.external.push(request.url());
    });
    await page.setViewportSize({ width: 560, height: 620 });
    await page.goto('/preview/');
    await page.selectOption('#model-select', model);
    await page.waitForFunction(() => document.querySelector('#load-status')?.dataset.state === 'ready');
    await page.evaluate(() => {
      const viewport = document.querySelector('#viewport');
      viewport.style.width = '514px';
      viewport.style.height = '514px';
      window.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('#model-id')).toHaveText(model);
    const snapshot = await page.evaluate(() => window.__NSS_PREVIEW__.snapshot());
    expect(snapshot.diagnostics.meshCount).toBeGreaterThan(0);
    expect(snapshot.diagnostics.materialCount).toBeGreaterThan(0);
    expect(snapshot.diagnostics.missingNormalMeshes).toBe(0);
    expect(errors).toEqual({ console: [], page: [], requests: [], external: [] });
    const folder = resolve(`../reports/renders/human-review/${family}/${model}`);
    await mkdir(folder, { recursive: true });
    await page.locator('canvas').screenshot({ path: resolve(folder, 'browser_512.png') });
    records.push({ model_id: model, diagnostics: snapshot.diagnostics, errors });
  });
}
