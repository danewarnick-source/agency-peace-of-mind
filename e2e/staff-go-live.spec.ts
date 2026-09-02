/**
 * Staff go-live e2e: punch pad clock-in/out.
 *
 * Mocked auth/org/caseload/activeShift. Does not write True North timesheets.
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoScenario(page: Page, scenario: string) {
  await page.goto(`/?scenario=${scenario}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-e2e-view]")).toBeVisible();
}

test.describe("Hive STAFF go-live — punch pad", () => {
  test("punch pad is the staff clock; Compass mic is gone", async ({ page }) => {
    await gotoScenario(page, "clock-in");
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Talk to Compass" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Clock in/i })).toBeEnabled();
    await page.getByRole("button", { name: /Clock in/i }).click();
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(1);
    expect(await page.evaluate(() => window.__e2e.clockInCalls.length)).toBe(1);
  });

  test("staff-only clock is not on admin home", async ({ page }) => {
    await gotoScenario(page, "admin");
    await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Talk to Compass" })).toHaveCount(0);
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toHaveCount(0);
  });

  test("GPS denied fail-closed: clock-in disabled, no timesheet write", async ({ page }) => {
    await gotoScenario(page, "gps-denied");
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toBeVisible();
    await expect(page.getByText(/GPS fail closed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Clock in/i })).toBeDisabled();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(0);
    expect(await page.evaluate(() => window.__e2e.clockInCalls.length)).toBe(0);
  });

  test("GPS timeout fail-closed: clock-in disabled, no timesheet write", async ({ page }) => {
    await gotoScenario(page, "gps-timeout");
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toBeVisible();
    await expect(page.getByRole("button", { name: /Clock in/i })).toBeDisabled();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();
  });

  test("punch pad requires goal, 30-word note, incident, behaviors, meds, attest", async ({
    page,
  }) => {
    await gotoScenario(page, "clock-out");
    const pad = page.locator("main[data-e2e-scene='punch-pad-clock-out']");
    await expect(pad).toBeVisible();
    const submit = page.getByRole("button", { name: /Submit timesheet/i });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox", { name: /Increase independent cooking skills/i }).check();
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: /Fill 30-word note/i }).click();
    await expect(page.getByRole("textbox", { name: "Shift note" })).toHaveValue(/word30/);
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: /^No$/i }).click();
    await expect(submit).toBeDisabled();

    await page.getByRole("radio", { name: /^No$/i }).click();
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox", { name: /I documented due medications/i }).check();
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox", { name: /I attest that this shift note/i }).check();
    await expect(submit).toBeEnabled();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();

    await submit.click();
    await expect(page.getByText(/Timesheet submitted/)).toBeVisible();
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(1);
  });

  test("Launchpad gate: clock-in blocked when has_passed_launchpad is false", async ({
    page,
  }) => {
    await gotoScenario(page, "launchpad-blocked");
    await expect(page.getByText(/Complete Launchpad before clocking in/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Clock in/i })).toBeDisabled();
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(0);
    expect(await page.evaluate(() => window.__e2e.clockInCalls.length)).toBe(0);
  });
});
