import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalizeFile = file => {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\//, '');
  return normalized.startsWith('tests/e2e/') ? normalized : `tests/e2e/${normalized}`;
};
const identity = ({ project, file, fullTitle }) => `${project}|${normalizeFile(file)}|${fullTitle}`;
const requireObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
};
const requireInteger = (value, label) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
};

const validateManifest = (manifest, phase) => {
  requireObject(manifest, 'manifest');
  if (manifest.phase !== phase) throw new Error(`manifest phase ${manifest.phase ?? '<missing>'} does not match ${phase}`);
  if (!Number.isInteger(manifest.manifestVersion) || manifest.manifestVersion < 1) throw new Error('manifestVersion must be a positive integer');
  if (!Array.isArray(manifest.tests) || !manifest.tests.length) throw new Error('manifest tests must be a non-empty array');
  const keys = manifest.tests.map((test, index) => {
    requireObject(test, `manifest.tests[${index}]`);
    for (const field of ['project', 'file', 'fullTitle']) {
      if (typeof test[field] !== 'string' || !test[field].trim()) throw new Error(`manifest.tests[${index}].${field} must be a non-empty string`);
    }
    return identity(test);
  });
  if (new Set(keys).size !== keys.length) throw new Error('manifest contains duplicate test identities');
  return keys;
};

const collectTests = report => {
  if (!Array.isArray(report.suites)) throw new Error('Playwright report suites must be an array');
  const tests = [];
  const visit = (suite, ancestors = []) => {
    requireObject(suite, 'Playwright suite');
    const suiteFile = suite.file;
    if (!Array.isArray(suite.specs)) throw new Error('Playwright suite specs must be an array');
    for (const spec of suite.specs) {
      requireObject(spec, 'Playwright spec');
      if (typeof spec.title !== 'string' || !spec.title) throw new Error('Playwright spec title is missing');
      if (!Array.isArray(spec.tests)) throw new Error('Playwright spec tests must be an array');
      const file = spec.file ?? suiteFile;
      if (typeof file !== 'string' || !file) throw new Error('Playwright spec file is missing');
      const fullTitle = [...ancestors, spec.title].join(' › ');
      for (const test of spec.tests) {
        requireObject(test, 'Playwright test');
        if (typeof test.projectName !== 'string' || !test.projectName) throw new Error('Playwright test projectName is missing');
        if (!Array.isArray(test.results) || !test.results.length) throw new Error('Playwright test results must be a non-empty array');
        const result = test.results.at(-1);
        requireObject(result, 'Playwright final result');
        if (typeof result.status !== 'string') throw new Error('Playwright final result status is missing');
        tests.push({
          key: identity({ project: test.projectName, file, fullTitle }),
          project: test.projectName,
          file: normalizeFile(file),
          fullTitle,
          status: test.status,
          result,
        });
      }
    }
    if (suite.suites !== undefined && !Array.isArray(suite.suites)) throw new Error('Playwright nested suites must be an array');
    for (const child of suite.suites ?? []) visit(child, [...ancestors, child.title]);
  };
  for (const suite of report.suites) visit(suite);
  return tests;
};

const technicalErrorCounts = tests => {
  const counts = { consoleErrors: 0, pageErrors: 0, failedRequests: 0, externalRequests: 0 };
  let attachments = 0;
  for (const test of tests) {
    if (test.result.attachments !== undefined && !Array.isArray(test.result.attachments)) throw new Error('Playwright result attachments must be an array');
    for (const attachment of test.result.attachments ?? []) {
      if (attachment.name !== 'technical-errors') continue;
      attachments += 1;
      if (typeof attachment.body !== 'string') throw new Error('technical-errors attachment body must be base64 JSON');
      let payload;
      try {
        payload = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      } catch {
        throw new Error('technical-errors attachment is malformed');
      }
      for (const field of ['console', 'page', 'failed', 'external']) {
        if (!Array.isArray(payload[field])) throw new Error(`technical-errors.${field} must be an array`);
      }
      counts.consoleErrors += payload.console.length;
      counts.pageErrors += payload.page.length;
      counts.failedRequests += payload.failed.length;
      counts.externalRequests += payload.external.length;
    }
  }
  return { ...counts, technicalErrorAttachments: attachments };
};

export const validateBrowserReport = ({ manifest, report, phase }) => {
  const manifestKeys = validateManifest(manifest, phase);
  requireObject(report, 'Playwright report');
  requireObject(report.stats, 'Playwright report stats');
  for (const field of ['expected', 'skipped', 'unexpected', 'flaky']) requireInteger(report.stats[field], `stats.${field}`);
  if (report.stats.passed !== undefined) requireInteger(report.stats.passed, 'stats.passed');
  if (!Array.isArray(report.errors)) throw new Error('Playwright report errors must be an array');

  const tests = collectTests(report);
  const actualCounts = new Map();
  for (const test of tests) actualCounts.set(test.key, (actualCounts.get(test.key) ?? 0) + 1);
  const actualKeys = new Set(actualCounts.keys());
  const manifestKeySet = new Set(manifestKeys);
  const duplicateTestIds = [...actualCounts].filter(([, count]) => count > 1).map(([key]) => key).sort();
  const missingTestIds = manifestKeys.filter(key => !actualKeys.has(key)).sort();
  const undeclaredTestIds = [...actualKeys].filter(key => !manifestKeySet.has(key)).sort();

  const passedTests = tests.filter(test => test.result.status === 'passed' && test.status === 'expected').length;
  const skippedTests = tests.filter(test => test.result.status === 'skipped' || test.status === 'skipped').length;
  const detailUnexpected = tests.filter(test => test.status === 'unexpected').length;
  const detailFlaky = tests.filter(test => test.status === 'flaky').length;
  const failedTests = tests.filter(test => !['passed', 'skipped'].includes(test.result.status) || test.status === 'unexpected').length;
  const runtime = technicalErrorCounts(tests);
  const validationErrors = [];

  if (report.stats.expected !== manifestKeys.length) validationErrors.push('stats.expected does not match the manifest length');
  if (report.stats.expected !== passedTests) validationErrors.push('stats.expected does not match passed test details');
  if (report.stats.passed !== undefined && report.stats.passed !== passedTests) validationErrors.push('stats.passed does not match passed test details');
  if (report.stats.skipped !== skippedTests) validationErrors.push('stats.skipped does not match skipped test details');
  if (report.stats.unexpected !== detailUnexpected) validationErrors.push('stats.unexpected does not match unexpected test details');
  if (report.stats.flaky !== detailFlaky) validationErrors.push('stats.flaky does not match flaky test details');
  if (report.stats.expected + report.stats.skipped + report.stats.unexpected + report.stats.flaky !== tests.length) {
    validationErrors.push('Playwright stats total does not match discovered test details');
  }
  if (report.errors.length) validationErrors.push('Playwright report contains top-level errors');

  const browserPassed = duplicateTestIds.length === 0
    && missingTestIds.length === 0
    && undeclaredTestIds.length === 0
    && failedTests === 0
    && skippedTests === 0
    && report.stats.unexpected === 0
    && report.stats.flaky === 0
    && runtime.consoleErrors === 0
    && runtime.pageErrors === 0
    && runtime.failedRequests === 0
    && runtime.externalRequests === 0
    && validationErrors.length === 0;

  return {
    phase,
    manifestVersion: manifest.manifestVersion,
    expectedTests: manifestKeys.length,
    discoveredTests: tests.length,
    passedTests,
    failedTests,
    skippedTests,
    unexpectedTests: report.stats.unexpected,
    flakyTests: report.stats.flaky,
    duplicateTests: duplicateTestIds.length,
    missingTests: missingTestIds.length,
    undeclaredTests: undeclaredTestIds.length,
    consoleErrors: runtime.consoleErrors,
    pageErrors: runtime.pageErrors,
    failedRequests: runtime.failedRequests,
    externalRequests: runtime.externalRequests,
    technicalErrorAttachments: runtime.technicalErrorAttachments,
    duplicateTestIds,
    missingTestIds,
    undeclaredTestIds,
    validationErrors,
    browserPassed,
    overallPassed: browserPassed,
  };
};

export const validateProtectedEnvironment = async ({ project, app, validationDir }) => {
  const catalog = await readJson(resolve(app, 'src/generated/parts.catalog.json'));
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
  const protectedDiff = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...protectedPaths], { cwd: project, encoding: 'utf8' })
    .trim().split(/\r?\n/).filter(Boolean);
  const governancePassed = waiver.result === 'PASS' && baseline.result === 'PASS' && phase2c.result === 'PASS';
  const javascriptFiles = (await readdir(resolve(app, 'dist/assets'))).filter(name => name.endsWith('.js'));
  const largestJavascriptBytes = Math.max(...await Promise.all(javascriptFiles.map(async name => (await stat(resolve(app, 'dist/assets', name))).size)));
  return {
    catalog,
    waiver,
    baseline,
    phase2c,
    packageJson,
    distFiles,
    expectedFiles,
    assetErrors,
    sourceGlbs,
    protectedDiff,
    governancePassed,
    largestJavascriptBytes,
    overallPassed: governancePassed && assetErrors.length === 0 && protectedDiff.length === 0,
  };
};
