import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_URL;
const e2eMode = process.env.E2E_MODE;
const runMock = e2eMode === "mock" || !stagingUrl;
const runStaging = !!stagingUrl && e2eMode !== "mock";
const mockPort = process.env.E2E_PORT ?? "8080";
const mockBase = `http://127.0.0.1:${mockPort}`;

const MOCK_SPEC = /client-1056-billing\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: runStaging ? "./e2e/global-setup.ts" : undefined,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  projects: [
    ...(runMock
      ? [
          {
            name: "chromium-mock",
            testMatch: MOCK_SPEC,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: mockBase,
              storageState: { cookies: [], origins: [] },
              screenshot: "only-on-failure" as const,
            },
          },
        ]
      : []),
    ...(runStaging
      ? [
          {
            name: "chromium",
            testIgnore: MOCK_SPEC,
            use: {
              ...devices["Desktop Chrome"],
              storageState: "./e2e/.auth.json",
              baseURL: stagingUrl,
            },
          },
        ]
      : []),
  ],
  use: {
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  webServer: runMock
    ? {
        command: `npx vite dev --port ${mockPort} --host 127.0.0.1`,
        url: mockBase,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
