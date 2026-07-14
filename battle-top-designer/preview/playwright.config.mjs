import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/browser',
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } },
  webServer: { command: 'node ../scripts/serve_preview.mjs --root .. --port 4173', port: 4173, reuseExistingServer: false },
});
