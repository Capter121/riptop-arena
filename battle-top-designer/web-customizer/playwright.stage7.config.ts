import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const artifactRunDir = process.env.NSS_PLAYWRIGHT_ARTIFACT_RUN_DIR;
const reporter = artifactRunDir
  ? [
      ['line'] as const,
      ['json', { outputFile: resolve(artifactRunDir, 'reporter.json') }] as const,
      ['html', { outputFolder: resolve(artifactRunDir, 'playwright-report'), open: 'never' }] as const,
    ]
  : [['line'] as const, ['json', { outputFile: process.env.PHASE3B_STAGE7_JSON ?? '../reports/validation/phase3b-stage7-playwright-repaired-v2.json' }] as const];

export default defineConfig({
  testDir: './tests/stage7',
  workers: 1,
  retries: 0,
  outputDir: artifactRunDir ? resolve(artifactRunDir, 'test-results') : './test-results',
  reporter,
  use: {
    baseURL: 'http://127.0.0.1:4176',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'stage7-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'stage7-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4176',
    port: 4176,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
