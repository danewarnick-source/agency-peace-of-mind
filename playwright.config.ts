import { defineConfig, devices } from "@playwright/test";

const mockAuth = process.env.E2E_MOCK_AUTH === "1" || !process.env.STAGING_URL;
const localBase = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: mockAuth ? undefined : "./e2e/global-setup.ts",
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(mockAuth ? {} : { storageState: "./e2e/.auth.json" }),
      },
      testMatch: mockAuth ? /admin-home-audit\.spec\.ts/ : undefined,
    },
  ],
  use: {
    baseURL: mockAuth ? localBase : process.env.STAGING_URL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: mockAuth
    ? {
        command: "npm run dev -- --host 127.0.0.1 --port 5173",
        url: localBase,
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
