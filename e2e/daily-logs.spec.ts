/**
 * Focused e2e: Daily Logs — staff submit + admin review/approve
 * (Sep 1 True North, mocked auth, no live PHI writes).
 *
 * This is `/dashboard/daily-logs` (staff journal + admin audit queue).
 * It is NOT Admin Home (obligations/audit ring) and NOT Compliance Desk
 * (timesheet shift notes). HHS hub daily notes are a separate path.
 *
 * Run: npm run test:e2e
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  assertPageNotBlank,
  installHiveMocks,
  waitForDashboard,
} from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(process.cwd(), "e2e/artifacts");

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage: false,
  });
}

function trackDailyLogWrites(page: Page): { writes: string[]; stop: () => void } {
  const writes: string[] = [];
  const onRequest = (req: Request) => {
    const method = req.method();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return;
    const url = req.url();
    if (/\/rest\/v1\/daily_logs/i.test(url)) {
      writes.push(`${method} ${url}`);
    }
  };
  page.on("request", onRequest);
  return {
    writes,
    stop: () => page.off("request", onRequest),
  };
}

async function gotoDailyLogs(page: Page) {
  await page.goto("/dashboard/daily-logs", { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

function mainHeading(page: Page, name: RegExp) {
  return page.getByRole("main").getByRole("heading", { name });
}

test.describe("Daily Logs — staff submit (mocked DSP)", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "dsp" });
  });

  test("1. Staff Daily Logs opens; list does not crash", async ({ page }) => {
    const tracker = trackDailyLogWrites(page);
    await gotoDailyLogs(page);

    await expect(mainHeading(page, /^Daily Logs$/i)).toBeVisible({ timeout: 20_000 });
    const main = page.getByRole("main");
    await expect(main.getByText(/Select a client to submit/i)).toBeVisible();
    await expect(main.getByRole("button", { name: /Resubmit Correction/i })).toBeVisible();
    await expect(main.getByText(/community activity and meal prep/i)).toBeVisible();
    await expect(main.getByText("Blake Stevens").first()).toBeVisible();
    await expect(main.getByRole("button", { name: /Complete log/i }).first()).toBeVisible();
    const todayCard = main.getByRole("button", { name: /Open daily journal/i }).first();
    await todayCard.scrollIntoViewIfNeeded();
    await expect(todayCard).toBeVisible();

    await assertPageNotBlank(page, "staff daily logs list");
    expect(tracker.writes, "staff list must not insert/update daily_logs").toEqual([]);
    tracker.stop();
    await shot(page, "01-staff-daily-logs-list");
  });

  test("2. Empty caseload shows a message instead of crashing", async ({ page }) => {
    await installHiveMocks(page, { persona: "dsp", emptyClients: true });
    await gotoDailyLogs(page);

    await expect(mainHeading(page, /^Daily Logs$/i)).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("main").getByText(/No HHS or RP5 clients currently assigned/i),
    ).toBeVisible();
    await assertPageNotBlank(page, "staff empty caseload");
    await expect(
      page.getByText(/Something went wrong in the dashboard shell/i),
    ).toHaveCount(0);
    await shot(page, "02-staff-empty-caseload");
  });

  test("3. Compose UI has required fields and Close does not save", async ({ page }) => {
    const tracker = trackDailyLogWrites(page);
    await gotoDailyLogs(page);

    await expect(page.getByRole("main").getByRole("button", { name: /Resubmit Correction/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("main").getByRole("button", { name: /Resubmit Correction/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/Tommy Jones/i).first()).toBeVisible();
    await expect(dialog.getByText(/PCSP Goals Addressed Today/i)).toBeVisible();
    await expect(dialog.getByText(/Community integration/i).first()).toBeVisible();
    await expect(dialog.getByText(/Daily Summary Narrative/i)).toBeVisible();
    await expect(dialog.locator("#narrative")).toBeVisible();
    await expect(dialog.getByText(/Caregiver Signature/i)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Submit Daily Host Home Log/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Submit Daily Host Home Log/i }),
    ).toBeDisabled();

    await shot(page, "03-staff-compose-required-fields");

    await dialog.getByRole("button", { name: /^Close$/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(mainHeading(page, /^Daily Logs$/i)).toBeVisible();
    expect(tracker.writes, "Close/cancel must not persist a daily log").toEqual([]);
    tracker.stop();
  });

  test("4. Complete-log / client picker always binds a client (no dead-end)", async ({
    page,
  }) => {
    await gotoDailyLogs(page);
    await expect(mainHeading(page, /^Daily Logs$/i)).toBeVisible({ timeout: 20_000 });

    const completeLog = page.getByRole("main").getByRole("button", { name: /Complete log/i }).first();
    await expect(completeLog).toBeVisible();
    await completeLog.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Client name is in the dialog description — this is the Daily Logs
    // equivalent of the June "Complete form" dead-end (form opened with no clientId).
    await expect(dialog.getByText(/Tommy Jones|Blake Stevens/i).first()).toBeVisible();
    await expect(dialog.locator("#narrative")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Submit Daily/i })).toBeVisible();

    await shot(page, "04-staff-complete-log-has-client");
    await dialog.getByRole("button", { name: /^Close$/i }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("Daily Logs — admin review (mocked admin)", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
  });

  test("5. Admin audit queue: pending vs approved; open one; Approve present; no persist", async ({
    page,
  }) => {
    const tracker = trackDailyLogWrites(page);
    await gotoDailyLogs(page);

    await expect(
      page.getByRole("heading", { name: /Host Home Daily Log Audit Queue/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Pending$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approved$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Returned$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^All$/i })).toBeVisible();

    await expect(page.getByText("Jake Probert").first()).toBeVisible();
    await expect(page.getByText("Tommy Jones").first()).toBeVisible();
    await expect(page.getByText(/^Pending$/).first()).toBeVisible();
    await shot(page, "05-admin-pending-queue");

    await page.getByRole("button", { name: /^Approved$/i }).click();
    await expect(page.getByText("Blake Stevens").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Jake Probert").first()).toBeVisible();
    await expect(page.getByText(/^Approved$/).first()).toBeVisible();
    await shot(page, "06-admin-approved-queue");

    await page.getByRole("button", { name: /^Pending$/i }).click();
    await expect(page.getByText("Tommy Jones").first()).toBeVisible({ timeout: 10_000 });
    await page.getByText("Tommy Jones").first().click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText(/Daily Host Home Log/i).first()).toBeVisible();
    await expect(sheet.getByText("Tommy Jones").first()).toBeVisible();
    await expect(sheet.getByText(/Jake Probert/i).first()).toBeVisible();
    await expect(sheet.getByText(/PCSP Goals Addressed/i)).toBeVisible();
    await expect(sheet.getByText(/Narrative/i).first()).toBeVisible();
    const approve = sheet.getByRole("button", { name: /Approve Log for Billing/i });
    await expect(approve).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Return to Caregiver for Correction/i })).toBeVisible();
    await shot(page, "07-admin-open-pending-approve-present");

    // Do NOT click Approve / Return — Tuesday walk must not persist live rows,
    // and this harness must not pretend a write happened.
    await sheet.getByRole("button", { name: /^Close$/i }).click();
    await expect(sheet).toHaveCount(0);
    expect(tracker.writes, "admin review must not PATCH/POST daily_logs").toEqual([]);
    tracker.stop();
  });

  test("6. Error and empty states do not blank the dashboard", async ({ page }) => {
    await installHiveMocks(page, { persona: "admin", emptyLogs: true });
    await gotoDailyLogs(page);
    await expect(
      page.getByRole("heading", { name: /Host Home Daily Log Audit Queue/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/No daily logs in this category/i)).toBeVisible();
    await assertPageNotBlank(page, "admin empty logs");

    await installHiveMocks(page, { persona: "admin", logsError: true });
    await gotoDailyLogs(page);
    await expect(
      page.getByRole("heading", { name: /Host Home Daily Log Audit Queue/i }),
    ).toBeVisible({ timeout: 20_000 });
    await assertPageNotBlank(page, "admin logs error");
    await expect(
      page.getByText(/Something went wrong in the dashboard shell/i),
    ).toHaveCount(0);
    await shot(page, "08-admin-empty-and-error");
  });
});
