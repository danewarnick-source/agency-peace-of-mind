import { defineConfig, devices } from "@playwright/test";

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Local mocked e2e — does not hit True North production / staging Supabase.
 * Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "compliance-desk.spec.ts",
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE,
    ...devices["Desktop Chrome"],
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  outputDir: "test-results",
  webServer: {
    command: `VITE_E2E_HARNESS=1 npx vite dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      VITE_E2E_HARNESS: "1",
    },
  },
});
