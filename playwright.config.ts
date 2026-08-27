import { defineConfig, devices } from "@playwright/test";

const stagingReady = Boolean(process.env.STAGING_URL && process.env.TEST_EMAIL && process.env.TEST_PASSWORD);
const mockBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: stagingReady ? "./e2e/global-setup.ts" : undefined,
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
    ...(stagingReady
      ? [
          {
            name: "staging",
            testIgnore: /admin-scheduler\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: process.env.STAGING_URL,
              storageState: "./e2e/.auth.json",
            },
          },
        ]
      : []),
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
