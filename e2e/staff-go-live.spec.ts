/**
 * Staff go-live e2e: Compass voice + punch pad clock-in/out.
 *
 * Mocked auth/org/caseload/activeShift. Does not write True North timesheets.
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import { TOMMY_ID } from "./harness/fixtures";

async function gotoScenario(page: Page, scenario: string) {
  await page.goto(`/?scenario=${scenario}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-e2e-view]")).toBeVisible();
}

async function openCompass(page: Page) {
  await page.getByRole("button", { name: "Talk to Compass" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Tap to speak")).toBeVisible();
  return sheet;
}

async function speakAndStop(page: Page, utterance: string) {
  const sheet = page.getByRole("dialog");
  await sheet.locator("button.h-16").click();
  await expect(sheet.getByText(/Tap stop when you're done/i)).toBeVisible();
  await page.evaluate((text) => window.__e2eSpeak(text), utterance);
  await sheet.locator("button.h-16").click();
  // Clock-out interview immediately re-opens the mic, so do not wait for
  // "Listening…" to vanish — wait for the next Compass turn instead.
  await expect(
    sheet
      .getByText(
        /Clock in with|Add to shift note|Clock-out questions|couldn't|Try again|Clock out of your current shift/i,
      )
      .first(),
  ).toBeVisible({ timeout: 10_000 });
}

test.describe("Hive STAFF go-live — Compass + punch pad", () => {
  test("1. staff can open Compass, see example prompts, Start/Stop mic UI", async ({ page }) => {
    await gotoScenario(page, "open-compass");
    await expect(page.getByRole("button", { name: "Talk to Compass" })).toBeVisible();

    const sheet = await openCompass(page);
    await expect(sheet.getByText(/Add to my shift note/i)).toBeVisible();
    await expect(sheet.getByText(/Clock me in with Justin for SEI/i)).toBeVisible();

    await sheet.locator("button.h-16").click();
    await expect(sheet.getByText("Listening…")).toBeVisible();
    await expect(sheet.getByText(/Tap stop when you're done/i)).toBeVisible();
    await sheet.locator("button.h-16").click();
    await expect(sheet.getByText("Tap to speak")).toBeVisible();
  });

  test("Compass is staff-only — never on admin", async ({ page }) => {
    await gotoScenario(page, "admin");
    await expect(page.getByRole("heading", { name: "Admin home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Talk to Compass" })).toHaveCount(0);
  });

  test("2. clock-in confirm shows client + code; caseload UUID enables Start shift", async ({
    page,
  }) => {
    await gotoScenario(page, "clock-in-valid");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Clock in with Tommy Jones for SEI/i)).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Start shift/i })).toBeEnabled();
    const id = await page.evaluate(() => window.__e2e.clockInResponse?.clientId);
    expect(id).toBe(TOMMY_ID);
  });

  test("2b. Bedrock name-as-id must NOT enable Start shift", async ({ page }) => {
    await gotoScenario(page, "clock-in-name-id");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Tommy Jones/i)).toBeVisible();
    const start = sheet.getByRole("button", { name: /Start shift/i });
    if ((await start.count()) > 0) {
      await expect(start).toBeDisabled();
    }
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(0);
  });

  test("2c. UUID not on caseload must NOT enable Start shift", async ({ page }) => {
    await gotoScenario(page, "clock-in-unknown-uuid");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    const start = page.getByRole("dialog").getByRole("button", { name: /Start shift/i });
    if ((await start.count()) > 0) {
      await expect(start).toBeDisabled();
    }
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(0);
  });

  test("3. GPS denied fail-closed: punch pad with client+code, no timesheet write", async ({
    page,
  }) => {
    await gotoScenario(page, "gps-denied");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    await page.getByRole("button", { name: /Start shift/i }).click();
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toBeVisible();
    await expect(page.getByText(/Clock in with Tommy Jones for SEI/i)).toBeVisible();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();
    const calls = await page.evaluate(() => window.__e2e.clockInCalls.length);
    expect(calls).toBe(0);
  });

  test("3b. GPS timeout fail-closed: punch pad, no timesheet write", async ({ page }) => {
    await gotoScenario(page, "gps-timeout");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    await page.getByRole("button", { name: /Start shift/i }).click();
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-in']")).toBeVisible();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();
  });

  test("4. spoken shift note uses NECTAR draftShiftNote; original transcript stored", async ({
    page,
  }) => {
    await gotoScenario(page, "spoken-note");
    await openCompass(page);
    const spoken =
      "Add to my shift note Tommy cooked pasta with two prompts and packed leftovers for later";
    await speakAndStop(page, spoken);
    await page.getByRole("button", { name: /Add to shift note/i }).click();
    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-out']")).toBeVisible();
    await expect(page.getByText(/What you said/i)).toBeVisible();
    await expect(page.getByText(/cooked pasta/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Shift note" })).toHaveValue(/NECTAR DRAFT/);
    const drafts = await page.evaluate(() => window.__e2e.draftCalls.length);
    expect(drafts).toBeGreaterThan(0);
    await expect(
      page.getByRole("checkbox", { name: /I attest that this shift note/i }),
    ).not.toBeChecked();
    await expect(page.getByRole("button", { name: /Submit timesheet/i })).toBeDisabled();
  });

  test("5. combined utterance starts clock-out interview then punch pad verify=1", async ({
    page,
  }) => {
    await gotoScenario(page, "clock-out-combined");
    await openCompass(page);
    await speakAndStop(page, "We went to the store, he was in a good mood. Clock me out.");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Clock-out questions/i)).toBeVisible();
    await expect(sheet.getByText(/Increase independent cooking skills/i)).toBeVisible();
    await expect(sheet.getByText(/Community access and public transportation/i)).toBeVisible();
    await expect(sheet.getByText(/General baseline monitoring/i)).toBeVisible();
    await expect(sheet.getByText(/Note Compass heard/i)).toBeVisible();

    await sheet.getByRole("button", { name: /Increase independent cooking skills/i }).click();
    await sheet.getByRole("button", { name: /^Continue$/i }).click();
    await expect(sheet.getByText(/incident report/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^No$/i }).click();
    await expect(sheet.getByText(/target behaviors/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^Yes$/i }).click();
    await expect(sheet.getByRole("button", { name: /Elopement/i })).toBeVisible();
    await sheet.getByRole("button", { name: /Elopement/i }).click();
    await sheet.getByRole("button", { name: /^Continue$/i }).click();

    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-out']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-e2e-verify]")).toHaveAttribute("data-e2e-verify", "1");
    await expect(page.getByRole("textbox", { name: "Shift note" })).toHaveValue(/NECTAR DRAFT/);
    await expect(page.getByText(/went to the store/i)).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /I attest that this shift note/i }),
    ).not.toBeChecked();
    await expect(page.getByText(/Timesheet submitted/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Submit timesheet/i })).toBeDisabled();
  });

  test("6. bare clock me out does not invent a note", async ({ page }) => {
    await gotoScenario(page, "clock-out-bare");
    await openCompass(page);
    await speakAndStop(page, "Clock me out");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/Clock-out questions/i)).toBeVisible();
    await expect(sheet.getByText(/Note Compass heard/i)).toHaveCount(0);

    await sheet.getByRole("button", { name: /Increase independent cooking skills/i }).click();
    await sheet.getByRole("button", { name: /^Continue$/i }).click();
    await expect(sheet.getByText(/incident report/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^No$/i }).click();
    await expect(sheet.getByText(/target behaviors/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^No$/i }).click();

    await expect(page.locator("main[data-e2e-scene='punch-pad-clock-out']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox", { name: "Shift note" })).toHaveValue("");
    const drafts = await page.evaluate(() => window.__e2e.draftCalls.length);
    expect(drafts).toBe(0);
  });

  test("7. punch pad still requires goal, 50-word note, incident, behaviors, meds, attest", async ({
    page,
  }) => {
    await gotoScenario(page, "clock-out-combined");
    await openCompass(page);
    await speakAndStop(page, "We went to the store, he was in a good mood. Clock me out.");
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: /Increase independent cooking skills/i }).click();
    await sheet.getByRole("button", { name: /^Continue$/i }).click();
    await expect(sheet.getByText(/incident report/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^No$/i }).click();
    await expect(sheet.getByText(/target behaviors/i)).toBeVisible();
    await sheet.getByRole("button", { name: /^No$/i }).click();

    const pad = page.locator("main[data-e2e-scene='punch-pad-clock-out']");
    await expect(pad).toBeVisible({ timeout: 15_000 });
    const submit = page.getByRole("button", { name: /Submit timesheet/i });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox", { name: /I documented due medications/i }).check();
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox", { name: /I attest that this shift note/i }).check();
    await expect(submit).toBeEnabled();
    await expect(page.getByText(/Timesheet writes: 0/)).toBeVisible();
  });

  test("8. Launchpad gate: clock-in blocked when has_passed_launchpad is false", async ({
    page,
  }) => {
    await gotoScenario(page, "launchpad-blocked");
    await openCompass(page);
    await speakAndStop(page, "Clock me in with Tommy for SEI");
    await page.getByRole("button", { name: /Start shift/i }).click();
    await expect(page.getByText(/has not completed Launchpad/i)).toBeVisible({ timeout: 8_000 });
    expect(await page.evaluate(() => window.__e2e.timesheetWrites)).toBe(0);
    expect(await page.evaluate(() => window.__e2e.clockInCalls.length)).toBe(0);
  });
});
