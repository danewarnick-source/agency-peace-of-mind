import { defineConfig, devices } from "@playwright/test";

const PORT = 4181;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /signup-walk\.spec\.ts/,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    ...devices["Desktop Chrome"],
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "off",
    trace: "retain-on-failure",
    video: "off",
  },
  outputDir: "test-results/signup-walk",
  webServer: {
    command: `npx vite dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
