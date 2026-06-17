import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  retries: 0,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "./e2e/.auth.json",
      },
    },
  ],
  use: {
    baseURL: process.env.STAGING_URL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
});
