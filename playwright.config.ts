import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL;
const mockBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

/** Mocked suites run via dedicated configs / the `mock` project — never against live staging. */
const MOCK_SPECS =
  /(?:hive-training-launchpad-gate|admin-home-audit|clients-staff-roster|staff-go-live|daily-logs|client-1056-billing|admin-scheduler|compliance-desk)\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "on",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mock",
      testMatch: "**/hive-training-launchpad-gate.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: mockBase,
        geolocation: { latitude: 40.7608, longitude: -111.891 },
        permissions: ["geolocation"],
      },
    },
    ...(stagingUrl
      ? [
          {
            name: "chromium",
            testIgnore: MOCK_SPECS,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: stagingUrl,
              storageState: "./e2e/.auth.json",
            },
          },
        ]
      : []),
  ],
  globalSetup: stagingUrl ? "./e2e/global-setup.ts" : undefined,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
