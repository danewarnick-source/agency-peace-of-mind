/**
 * Admin Home first-login checklist (preview C).
 * Mocked empty office — owner only, no clients, no shifts.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { installHiveMocks, screenshotPath } from "./helpers/admin-home-mock";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";

async function shot(page: Page, name: string) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: screenshotPath(name), fullPage: true });
  } catch {
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }).catch(() => {});
  }
}

test.describe("Admin Home first-login checklist", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin", firstLogin: true });
  });

  test("new owner sees the three-step setup, not Nectar or a compliance dump", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/You're 0 of 3 set up/i)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("heading", { name: /Your office is ready/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Add first staff/i })).toBeVisible();
    await expect(page.getByText(/Add first client/i).first()).toBeVisible();
    await expect(page.getByText(/Schedule a shift/i).first()).toBeVisible();
    await expect(page.getByText(/Built-in obligations are already covered/i)).toBeVisible();

    await expect(page.getByText(/I'm NECTAR/i)).toHaveCount(0);
    await expect(page.getByText(/Upload your authoritative sources/i)).toHaveCount(0);
    await expect(page.getByText(/Staff with overdue/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Compliance by area/i })).toHaveCount(0);

    await shot(page, "admin-home-first-login");
  });

  test("Add first staff CTA opens the employees hub", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /Add first staff/i })).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("link", { name: /Add first staff/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/hub\/employees/, { timeout: 15_000 });
  });
});
