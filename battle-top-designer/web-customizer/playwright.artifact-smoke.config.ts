import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const runDir = process.env.NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR;
if (!runDir) throw new Error('NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR is required for artifact smoke runs.');

export default defineConfig({
  testDir: './tests/artifact-smoke',
  workers: 1,
  retries: 0,
  outputDir: resolve(runDir, 'test-results'),
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(runDir, 'reporter.json') }],
    ['html', { outputFolder: resolve(runDir, 'playwright-report'), open: 'never' }],
  ],
});
