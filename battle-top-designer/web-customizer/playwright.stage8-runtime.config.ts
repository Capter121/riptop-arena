import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const runDir = process.env.NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR;
if (!runDir) throw new Error('NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR is required for Stage 8 runtime smoke.');

export default defineConfig({
  testDir: './tests/stage8',
  workers: 1,
  retries: 0,
  outputDir: resolve(runDir, 'test-results'),
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(runDir, 'reporter.json') }],
    ['html', { outputFolder: resolve(runDir, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'stage8-runtime', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run serve:dist',
    port: 4175,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
