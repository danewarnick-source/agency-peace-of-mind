import { defineConfig, devices } from "@playwright/test";

const runStaging = Boolean(
  process.env.STAGING_URL && process.env.TEST_EMAIL && process.env.TEST_PASSWORD,
);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: runStaging ? "./e2e/global-setup.ts" : undefined,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "staff-go-live",
      testMatch: "**/staff-go-live.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4177",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
        video: "retain-on-failure",
      },
    },
    ...(runStaging
      ? [
          {
            name: "chromium",
            testIgnore: "**/staff-go-live.spec.ts",
            use: {
              ...devices["Desktop Chrome"],
              storageState: "./e2e/.auth.json",
              baseURL: process.env.STAGING_URL,
              actionTimeout: 10_000,
              navigationTimeout: 20_000,
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: "npx vite --config e2e/harness/vite.config.ts",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
});
