import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateBrowserReport } from '../../scripts/report-phase-validation.mjs';
import { createPhase3aBrowserSection } from '../../scripts/report-phase3a.mjs';
import { createPhase3bMachineReport } from '../../scripts/report-phase3b.mjs';

const readJson = async url => JSON.parse(await readFile(url, 'utf8'));
const phase3aManifest = await readJson(new URL('../../validation-manifests/phase3a-browser-suite.json', import.meta.url));
const phase3bManifest = await readJson(new URL('../../validation-manifests/phase3b-browser-suite.json', import.meta.url));

const technicalErrorsBody = overrides => Buffer.from(JSON.stringify({
  console: [],
  page: [],
  failed: [],
  external: [],
  ...overrides,
})).toString('base64');

const makeTest = entry => ({
  timeout: 1000,
  annotations: [],
  expectedStatus: 'passed',
  projectId: entry.project,
  projectName: entry.project,
  results: [{
    status: 'passed',
    duration: 1,
    errors: [],
    retry: 0,
    attachments: [{
      name: 'technical-errors',
      contentType: 'application/json',
      body: technicalErrorsBody(),
    }],
  }],
  status: 'expected',
});

const makeBrowserReport = manifest => ({
  config: {},
  suites: manifest.tests.map((entry, index) => ({
    title: entry.file.split('/').at(-1),
    file: entry.file.replace(/^tests\/e2e\//, ''),
    specs: [{
      title: entry.fullTitle,
      ok: true,
      tests: [makeTest(entry)],
      id: `fixture-${index}`,
      file: entry.file.replace(/^tests\/e2e\//, ''),
      line: 1,
      column: 1,
    }],
    suites: [],
  })),
  errors: [],
  stats: {
    expected: manifest.tests.length,
    skipped: 0,
    unexpected: 0,
    flaky: 0,
    passed: manifest.tests.length,
  },
});

const clone = value => structuredClone(value);
const validate = (manifest, report, phase = manifest.phase) => validateBrowserReport({ manifest, report, phase });
const lastTest = report => report.suites.at(-1).specs[0].tests[0];
const setTechnicalErrors = (report, field) => {
  lastTest(report).results[0].attachments[0].body = technicalErrorsBody({ [field]: ['fixture error'] });
};

describe('phase-aware validation reporting', () => {
  it('accepts the historical Phase 3A 2/2 suite', () => {
    expect(validate(phase3aManifest, makeBrowserReport(phase3aManifest)).overallPassed).toBe(true);
  });

  it('accepts the current Phase 3B 18/18 suite', () => {
    const result = validate(phase3bManifest, makeBrowserReport(phase3bManifest));
    expect(result).toMatchObject({ expectedTests: 18, discoveredTests: 18, passedTests: 18, overallPassed: true });
  });

  it('rejects a Phase 3B report with only 17 declared tests', () => {
    const report = makeBrowserReport(phase3bManifest);
    report.suites.pop();
    expect(validate(phase3bManifest, report).overallPassed).toBe(false);
  });

  it('rejects an undeclared nineteenth test', () => {
    const report = makeBrowserReport(phase3bManifest);
    const extra = clone(report.suites[0]);
    extra.specs[0].title = 'undeclared browser test';
    report.suites.push(extra);
    report.stats.expected = 19;
    report.stats.passed = 19;
    expect(validate(phase3bManifest, report)).toMatchObject({ undeclaredTests: 1, overallPassed: false });
  });

  it('rejects duplicate test identities', () => {
    const report = makeBrowserReport(phase3bManifest);
    report.suites.push(clone(report.suites[0]));
    report.stats.expected = 19;
    report.stats.passed = 19;
    expect(validate(phase3bManifest, report)).toMatchObject({ duplicateTests: 1, overallPassed: false });
  });

  it('rejects any failed test', () => {
    const report = makeBrowserReport(phase3bManifest);
    lastTest(report).results[0].status = 'failed';
    lastTest(report).status = 'unexpected';
    report.stats.expected = 17;
    report.stats.passed = 17;
    report.stats.unexpected = 1;
    expect(validate(phase3bManifest, report)).toMatchObject({ failedTests: 1, overallPassed: false });
  });

  it('rejects any skipped critical test', () => {
    const report = makeBrowserReport(phase3bManifest);
    lastTest(report).results[0].status = 'skipped';
    lastTest(report).status = 'skipped';
    report.stats.expected = 17;
    report.stats.passed = 17;
    report.stats.skipped = 1;
    expect(validate(phase3bManifest, report)).toMatchObject({ skippedTests: 1, overallPassed: false });
  });

  it('rejects any unexpected result count', () => {
    const report = makeBrowserReport(phase3bManifest);
    report.stats.unexpected = 1;
    expect(validate(phase3bManifest, report)).toMatchObject({ unexpectedTests: 1, overallPassed: false });
  });

  it('rejects stats.expected that differs from the manifest length', () => {
    const report = makeBrowserReport(phase3bManifest);
    report.stats.expected = 17;
    expect(validate(phase3bManifest, report).overallPassed).toBe(false);
  });

  it('rejects stats.passed that differs from passed test details', () => {
    const report = makeBrowserReport(phase3bManifest);
    report.stats.passed = 17;
    expect(validate(phase3bManifest, report).overallPassed).toBe(false);
  });

  it('rejects missing or malformed Playwright fields', () => {
    const report = makeBrowserReport(phase3bManifest);
    delete report.stats;
    expect(() => validate(phase3bManifest, report)).toThrow(/stats/);
  });

  it('rejects a manifest for the wrong phase', () => {
    expect(() => validate(phase3aManifest, makeBrowserReport(phase3aManifest), 'phase3b')).toThrow(/phase/);
  });

  it('rejects nonzero console errors', () => {
    const report = makeBrowserReport(phase3bManifest);
    setTechnicalErrors(report, 'console');
    expect(validate(phase3bManifest, report)).toMatchObject({ consoleErrors: 1, overallPassed: false });
  });

  it('rejects nonzero page errors', () => {
    const report = makeBrowserReport(phase3bManifest);
    setTechnicalErrors(report, 'page');
    expect(validate(phase3bManifest, report)).toMatchObject({ pageErrors: 1, overallPassed: false });
  });

  it('rejects nonzero failed requests', () => {
    const report = makeBrowserReport(phase3bManifest);
    setTechnicalErrors(report, 'failed');
    expect(validate(phase3bManifest, report)).toMatchObject({ failedRequests: 1, overallPassed: false });
  });

  it('rejects nonzero external requests', () => {
    const report = makeBrowserReport(phase3bManifest);
    setTechnicalErrors(report, 'external');
    expect(validate(phase3bManifest, report)).toMatchObject({ externalRequests: 1, overallPassed: false });
  });

  it('keeps the Phase 3A compatibility entry in the historical browser format', () => {
    const validation = validate(phase3aManifest, makeBrowserReport(phase3aManifest));
    expect(createPhase3aBrowserSection(validation)).toEqual({
      result: 'PASS', desktop: true, mobile: true, expected: 2, unexpected: 0, flaky: 0,
    });
  });

  it('creates the Phase 3B machine report with all required counters', () => {
    const validation = validate(phase3bManifest, makeBrowserReport(phase3bManifest));
    expect(createPhase3bMachineReport(validation)).toMatchObject({
      phase: 'phase3b', manifestVersion: 1,
      expectedTests: 18, discoveredTests: 18, passedTests: 18,
      failedTests: 0, skippedTests: 0, unexpectedTests: 0,
      duplicateTests: 0, missingTests: 0, undeclaredTests: 0,
      consoleErrors: 0, pageErrors: 0, failedRequests: 0, externalRequests: 0,
      browserPassed: true, overallPassed: true,
    });
  });
});
