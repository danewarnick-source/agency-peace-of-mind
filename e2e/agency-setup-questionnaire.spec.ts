/**
 * Focused e2e: the comprehensive agency setup questionnaire (mocked admin).
 * Proves the sectioned UI renders, conditional sections appear for the
 * awarded codes that should trigger them (RHS / HHS / PBA), progress
 * reflects only currently-applicable required questions, and Save draft /
 * Finish setup are distinct, working controls.
 *
 * Run: npx playwright test e2e/agency-setup-questionnaire.spec.ts --project=mock
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { installHiveMocks, waitForDashboard } from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(process.cwd(), "test-results", "agency-setup-questionnaire");

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: true });
}

test.describe("Agency setup questionnaire — mocked admin", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
  });

  test("renders every section, conditional callouts for RHS/HHS/PBA, and live progress", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings/compliance-setup", { waitUntil: "domcontentloaded" });
    await waitForDashboard(page);

    await expect(page.getByRole("heading", { name: "Agency setup" })).toBeVisible({
      timeout: 20_000,
    });

    // Every section renders as a collapsible header button.
    for (const section of [
      "Services & contract",
      "Locations & licensing",
      "Residential & host-home operations",
      "Transportation",
      "Workforce & governance",
      "Clinical & behavior support",
      "Employment services",
      "Client funds & representative payee",
    ]) {
      await expect(page.getByRole("button", { name: section })).toBeVisible();
    }

    // Fixture awards HHS/RHS/SEI/PBA — RHS + host-home + PBA callouts fire.
    await expect(page.getByText("RHS — staffed residential homes")).toBeVisible();
    await expect(page.getByText(/HHS \/ PPS — host-home/)).toBeVisible();
    await expect(page.getByText("PBA — Personal Budget Assistant")).toBeVisible();

    // SEI is awarded, so the award-date question is visible and required.
    await expect(
      page.getByText(
        "When was this contractor awarded SEI (Supported Employment for an Individual)?",
      ),
    ).toBeVisible();

    await shot(page, "01-full-questionnaire-conditional-sections");

    // Progress reflects the fixture's partially-answered state (not 0, not 100).
    const progress = page.getByText(/of \d+ required questions answered/);
    await expect(progress).toBeVisible();
    const progressText = (await progress.textContent()) ?? "";
    expect(progressText).toMatch(/^\d+ of \d+ required questions answered$/);
    const [answered, required] = progressText.match(/\d+/g)!.map(Number);
    expect(answered).toBeGreaterThan(0);
    expect(answered).toBeLessThan(required);

    await shot(page, "02-progress-detail");
  });

  test("Save draft and Finish setup are distinct controls", async ({ page }) => {
    await page.goto("/dashboard/settings/compliance-setup", { waitUntil: "domcontentloaded" });
    await waitForDashboard(page);
    await expect(page.getByRole("heading", { name: "Agency setup" })).toBeVisible({
      timeout: 20_000,
    });

    const saveDraft = page.getByRole("button", { name: "Save draft" });
    const finish = page.getByRole("button", { name: "Finish setup" });
    await expect(saveDraft).toBeVisible();
    await expect(finish).toBeVisible();

    // Fixture starts incomplete (missing several new required facts) —
    // Finish setup must refuse and say what's missing, never silently pass.
    await finish.click();
    await expect(page.getByText(/required questions? still need an answer/)).toBeVisible();
    await shot(page, "03-finish-blocked-shows-missing");

    await saveDraft.click();
    await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 10_000 });
    await shot(page, "04-save-draft-success");
  });
});
