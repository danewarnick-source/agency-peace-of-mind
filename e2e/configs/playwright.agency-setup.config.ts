import { defineConfig, devices } from "@playwright/test";

const mockPort = process.env.E2E_PORT ?? "8099";
const mockBase = `http://127.0.0.1:${mockPort}`;

/**
 * Local mocked agency-setup questionnaire e2e — intercepts Supabase and the
 * getAgencySetupStatus / persistAgencySetupFacts server functions in the
 * browser. Staging crawler remains playwright.config.ts (STAGING_URL + TEST_EMAIL).
 */
export default defineConfig({
  testDir: "..",
  testMatch: /agency-setup-questionnaire\.spec\.ts/,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "../../playwright-report" }]],
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
