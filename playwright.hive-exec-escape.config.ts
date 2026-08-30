import { defineConfig, devices } from "@playwright/test";

/**
 * Phone-width Command Center escape hatch — no app server.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "hive-exec-phone-escape.spec.ts",
  retries: 0,
  timeout: 30_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
});
