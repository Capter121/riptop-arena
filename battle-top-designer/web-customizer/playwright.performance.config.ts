import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/performance',
  workers: 1,
  reporter: 'line',
  timeout: 360000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    launchOptions: { args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run serve:dist',
    port: 4175,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
