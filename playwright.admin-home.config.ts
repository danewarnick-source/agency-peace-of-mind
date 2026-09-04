import { defineConfig, devices } from "@playwright/test";

const localBase = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";

/**
 * Local mocked Admin Home / obligations e2e — intercepts Supabase in the browser.
 * Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-home-audit\.spec\.ts|admin-home-first-login\.spec\.ts|portal-view-phone\.spec\.ts/,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: localBase,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: localBase,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
