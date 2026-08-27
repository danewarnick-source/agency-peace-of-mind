import { defineConfig, devices } from "@playwright/test";

const mockBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

/**
 * Local mocked admin-scheduler e2e — intercepts Supabase in the browser.
 * Does not use VITE_E2E_HARNESS (that harness is for compliance-desk).
 * Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  projects: [
    {
      name: "admin-scheduler-mock",
      testMatch: /admin-scheduler\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: mockBase,
        timezoneId: "America/Denver",
        locale: "en-US",
        viewport: { width: 1400, height: 900 },
        screenshot: "on",
        trace: "retain-on-failure",
      },
    },
  ],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 25_000,
  },
  webServer:
    process.env.E2E_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npx vite --port 5173 --host 127.0.0.1 --strictPort",
          url: mockBase,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
});
