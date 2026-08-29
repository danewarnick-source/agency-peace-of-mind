import { defineConfig, devices } from "@playwright/test";

const PORT = 4184;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "stripe-checkout.spec.ts",
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE,
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results",
  webServer: {
    command: `npx vite dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
