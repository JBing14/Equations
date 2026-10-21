import { defineConfig, devices } from '@playwright/test';

// Set E2E_BASE_URL to test an already-running copy of the site (for example the
// built site served somewhere). Otherwise the Vite dev server is started for you.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: external ?? 'http://localhost:5173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsive/ },
    { name: 'phone', use: { ...devices['Pixel 5'] }, testMatch: /responsive/ },
  ],
  webServer: external
    ? undefined
    : { command: 'npm run dev -- --port 5173', url: 'http://localhost:5173/', reuseExistingServer: true, timeout: 60_000 },
});
