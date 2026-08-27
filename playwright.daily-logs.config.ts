import { defineConfig, devices } from "@playwright/test";

const mockPort = process.env.E2E_PORT ?? "8080";
const mockBase = `http://127.0.0.1:${mockPort}`;

/**
 * Local mocked Daily Logs e2e — intercepts Supabase in the browser.
 * Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /daily-logs\.spec\.ts/,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: mockBase,
    storageState: { cookies: [], origins: [] },
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite dev --port ${mockPort} --host 127.0.0.1`,
    url: mockBase,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
