import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/challenge',
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4182',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'friend-challenge', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'node scripts/start-challenge-e2e-server.mjs',
    url: 'http://127.0.0.1:4182/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
