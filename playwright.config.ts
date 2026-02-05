import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8888';
const isLocal =
  baseURL.startsWith('http://127.0.0.1') ||
  baseURL.startsWith('http://localhost') ||
  baseURL.startsWith('https://127.0.0.1') ||
  baseURL.startsWith('https://localhost');

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(isLocal
    ? {
        webServer: {
          command: 'netlify serve --functions netlify/functions --port 8888',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }
    : {}),
});
