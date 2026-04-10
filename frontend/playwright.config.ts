import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * Assumes:
 *   - Backend running on http://localhost:8460
 *   - Frontend dev server running on http://localhost:9460
 *   - Vite proxy forwards /api requests to the backend
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:9460',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
});
