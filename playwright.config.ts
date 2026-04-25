import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Robin v2 E2E tests.
 *
 * Run:   npx playwright test
 * UI:    npx playwright test --ui
 * Debug: npx playwright test --debug
 *
 * Authentication strategy: the app uses Microsoft Entra ID (OAuth only — no
 * credential provider). Real OAuth cannot be driven by Playwright in CI.
 * The setup project (auth.setup.ts) injects a fake NextAuth JWT cookie
 * directly into browser storage to simulate signed-in sessions without
 * hitting Microsoft's servers. See tests/e2e/helpers/session.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  use: {
    /* Base URL — override with BASE_URL env var in CI */
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',

    /* Collect trace on first retry only to keep CI artifacts small */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on first retry */
    video: 'on-first-retry',

    /* French locale to match app language */
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },

  projects: [
    /* ------------------------------------------------------------------ */
    /* Setup: writes .auth/*.json storageState used by the projects below  */
    /* ------------------------------------------------------------------ */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    /* ------------------------------------------------------------------ */
    /* Unauthenticated: no stored session, browser starts fresh            */
    /* ------------------------------------------------------------------ */
    {
      name: 'unauthenticated',
      testMatch: /.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the Next.js dev server automatically during local runs */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
