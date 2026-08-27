import { defineConfig, devices } from "@playwright/test";

/**
 * Isolated Compass + punch pad staff go-live harness.
 * Uses e2e/harness/vite.config.ts (not the app's VITE_E2E_HARNESS).
 * Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/staff-go-live.spec.ts",
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4177",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  webServer: {
    command: "npx vite --config e2e/harness/vite.config.ts",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
