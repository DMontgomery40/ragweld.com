import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:8888',
    headless: true,
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'netlify serve --functions netlify/functions --port 8888',
    url: 'http://127.0.0.1:8888',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
