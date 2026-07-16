import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/stage7',
  workers: 1,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: '../reports/validation/phase3b-stage7-playwright.json' }]],
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
