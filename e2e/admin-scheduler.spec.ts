/**
 * Admin scheduler / published-shifts e2e for True North Sep 1 2026 go-live.
 *
 * Auth is mocked as Company Admin. Every Supabase REST write and every
 * mutating server function is intercepted — these tests never touch the
 * live calendar. Staff schedule (`/dashboard/schedule`) is not the target;
 * admin nav points at /dashboard/scheduler (legacy /scheduling and
 * /schedule-preview redirect there).
 *
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import {
  installHiveMocks,
  saveShot,
  type HiveMock,
} from "./helpers/hive-mock";

test.use({
  timezoneId: "America/Denver",
  locale: "en-US",
  viewport: { width: 1400, height: 900 },
});

async function openAdminScheduler(page: Page, mockRole: "admin" | "employee" = "admin"): Promise<HiveMock> {
  const mock = await installHiveMocks(page, mockRole);
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/Download the React DevTools|vite\/client|hydrated but some attributes/i.test(t)) return;
      consoleErrors.push(t);
    }
  });
  (page as Page & { _e2eConsoleErrors?: string[] })._e2eConsoleErrors = consoleErrors;
  return mock;
}

function consoleErrorsOf(page: Page): string[] {
  return (page as Page & { _e2eConsoleErrors?: string[] })._e2eConsoleErrors ?? [];
}

async function waitForSchedulerChrome(page: Page) {
  try {
    // "Publish" is unique to the admin scheduler brand bar. getByText("SCHEDULER")
    // is case-insensitive and also matches the sidebar "Scheduler" link / h1.
    await expect(page.getByRole("button", { name: /^Publish$/ })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("HIVE SCHEDULER")).toBeVisible();
  } catch (err) {
    const dump = await page.evaluate(() => ({
      href: location.href,
      body: (document.body?.innerText ?? "").slice(0, 1200),
    }));
    // eslint-disable-next-line no-console
    console.log("[e2e-dump]", JSON.stringify(dump));
    throw err;
  }
  await expect(page.getByRole("button", { name: /^Schedule$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Day Program/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Staff view/i })).toBeVisible();
}

async function goToSep1(page: Page) {
  const dayBtn = page.getByRole("button", { name: /^Day$/ });
  await dayBtn.click();
  const label = page.locator("span.tabular-nums");
  for (let i = 0; i < 14; i++) {
    const text = (await label.textContent()) ?? "";
    if (/Sep(?:tember)?\s*1\b/i.test(text)) return;
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(150);
  }
  throw new Error(`Could not reach Sep 1. Last label: ${await label.textContent()}`);
}

async function expandCode(page: Page, code: string) {
  const header = page.getByRole("button", { name: new RegExp(`^${code}\\b`) }).first();
  await expect(header).toBeVisible({ timeout: 10_000 });
  await header.click();
}

/** Staff-view preview picker — not the sidebar Portal View combobox. */
async function openStaffPreviewPicker(page: Page) {
  await page.getByRole("button", { name: /Staff view/i }).click();
  await expect(page.getByText(/Staff portal preview/i)).toBeVisible({ timeout: 8_000 });
  const trigger = page.getByText(/Staff portal preview/i).locator("xpath=..").getByRole("combobox");
  await expect(trigger).toBeVisible();
  await trigger.click();
}

test.describe("Admin scheduler — True North Sep 1", () => {
  test("1. admin can open /dashboard/scheduler without crash; calendar renders", async ({ page }) => {
    const mock = await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);

    await expect(page.getByRole("button", { name: /^Day$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Week$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Month$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Publish/ })).toBeVisible();

    // Collapsed code sections are the schedule list (SLH + SEI; HHS is daily-rate).
    await expect(page.getByRole("button", { name: /^SLH\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^SEI\b/ })).toBeVisible();

    await expect(page.getByText(/No data available/i)).toHaveCount(0);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);

    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(40);

    const crashes = consoleErrorsOf(page).filter((e) =>
      /uncaught|is not defined|cannot read|hydration/i.test(e),
    );
    expect(crashes, crashes.join(" | ")).toHaveLength(0);
    expect(mock.writes.filter((w) => w.table === "scheduled_shifts")).toHaveLength(0);

    await saveShot(page, "01-scheduler-loads");
  });

  test("2. published vs draft distinction is visible", async ({ page }) => {
    const mock = await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);
    await expandCode(page, "SEI");

    // Published 9–3 block (Tommy) and draft 3:30 open block both render.
    await expect(page.getByText(/Tommy/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Open/i).first()).toBeVisible();

    await page.getByText(/Tommy/i).first().click();
    await expect(page.getByText(/Published:\s*yes/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Status:\s*published/i)).toBeVisible();
    await saveShot(page, "02a-published-shift-detail");
    await page.locator(".fixed.inset-y-0.right-0").locator("button").first().click();

    await page.getByText(/^Open\b/).first().click();
    await expect(page.getByText(/Published:\s*no/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Status:\s*draft/i)).toBeVisible();
    await saveShot(page, "02b-draft-shift-detail");

    expect(mock.writes.filter((w) => w.table === "scheduled_shifts")).toHaveLength(0);
  });

  test("3. filter/select by client, staff, service code when those controls exist", async ({ page }) => {
    await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);

    // Service-code sections are the scheduler's filter. Expanding SLH should
    // show Tom Jones and not Jake Probert.
    await expandCode(page, "SLH");
    await expect(page.getByText(/Tom Jones/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Jake Probert/i)).toHaveCount(0);
    await saveShot(page, "03a-filter-slh-section");

    await expandCode(page, "SEI");
    await expect(page.getByText(/Jake Probert/i).first()).toBeVisible({ timeout: 8_000 });
    await saveShot(page, "03b-filter-sei-section");

    // Staff selector lives on Staff view (not the sidebar Portal View combobox).
    await openStaffPreviewPicker(page);
    await expect(page.getByRole("option", { name: /Tommy Jones/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("option", { name: /Riley NoShifts/i })).toBeVisible();
    await page.getByRole("option", { name: /Riley NoShifts/i }).click();
    await saveShot(page, "03c-staff-view-select");
  });

  test("4. creating/editing a shift UI exists (open dialogs only; do not save)", async ({ page }) => {
    const mock = await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);
    await expandCode(page, "SEI");

    // Click an empty hour cell (title="Add shift") on Jake's row.
    const addCell = page.locator('button[title="Add shift"]').first();
    await expect(addCell).toBeVisible({ timeout: 8_000 });
    await addCell.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByText(/Add shift/i).first()).toBeVisible();
    await expect(dialog.getByText("CLIENT", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/SERVICE CODE \(AUTHORIZED ONLY\)/i)).toBeVisible();
    await expect(dialog.getByText(/STAFF \(CLIENT'S AUTHORIZED TEAM\)/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Cancel$/i })).toBeVisible();
    await saveShot(page, "04-add-shift-dialog");

    await dialog.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(dialog).toHaveCount(0);

    // Edit surface is the shift detail panel (Edit button is present, even if disabled).
    await page.getByText(/Tommy/i).first().click();
    await expect(page.getByRole("button", { name: /Edit/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /Duplicate/i })).toBeVisible();
    await saveShot(page, "04b-edit-shift-panel");

    expect(mock.writes.filter((w) => w.table === "scheduled_shifts")).toHaveLength(0);
  });

  test("5. staff assigned to a published shift is visible; empty-state when none", async ({ page }) => {
    await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);
    await expandCode(page, "SEI");

    await page.getByText(/Tommy/i).first().click();
    await expect(page.getByText(/ASSIGNED STAFF/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Tommy Jones/i).first()).toBeVisible();
    await saveShot(page, "05a-assigned-staff");

    const closePanel = page.locator(".fixed.inset-y-0.right-0").getByRole("button").first();
    await closePanel.click();

    await page.getByText(/^Open\b/).first().click();
    await expect(page.getByText(/Open \(no one assigned\)|Open/i).first()).toBeVisible({ timeout: 8_000 });
    await saveShot(page, "05b-unassigned-open");

    // Staff view empty state for Riley (no assigned shifts).
    await openStaffPreviewPicker(page);
    await page.getByRole("option", { name: /Riley NoShifts/i }).click();
    await expect(page.getByText(/No shifts/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Assigned shifts appear here/i)).toBeVisible();
    await saveShot(page, "05c-staff-view-empty");
  });

  test("5b. unpublished assigned shift still appears on Staff view and as one clean bar", async ({ page }) => {
    await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);
    await expandCode(page, "SLH");

    // Day-view bar: one readable label, not stacked name+time layers.
    const slhBar = page.getByRole("button", { name: /Stephen · 10:00\s*AM\s*[–-]\s*2:00\s*PM/i }).first();
    await expect(slhBar).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Stephen · 4:00\s*PM\s*[–-]\s*6:00\s*PM/i })).toBeVisible();

    await openStaffPreviewPicker(page);
    await page.getByRole("option", { name: /Stephen Prince/i }).click();
    await expect(page.getByText(/Tom Jones · SLH · 10:00\s*AM\s*[–-]\s*2:00\s*PM/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Tom Jones · SLH · 4:00\s*PM\s*[–-]\s*6:00\s*PM · Draft/i)).toBeVisible();
    await saveShot(page, "05d-staff-view-draft-assigned");
  });

  test("6. staff-only users do not get the full admin scheduler", async ({ page }) => {
    await openAdminScheduler(page, "employee");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /^My Caseload$/ })).toBeVisible({ timeout: 25_000 });

    // Admin nav item is "Scheduler"; staff nav item is "Schedule".
    const schedulerNav = page.getByRole("link", { name: /^Scheduler$/ });
    await expect(schedulerNav, "Staff portal must not list the admin Scheduler nav item").toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Schedule$/ }).first()).toBeVisible();
    await saveShot(page, "06a-staff-nav");

    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 20_000 });
    await expect(page.getByText(/^Loading…$/)).toHaveCount(0, { timeout: 25_000 });
    await saveShot(page, "06b-staff-direct-scheduler-url");
    // Product rule: staff without create_shifts land on caseload, not admin Publish.
    const publish = page.getByRole("button", { name: /Publish/ });
    await expect(
      publish,
      "Staff visiting /dashboard/scheduler must not see the admin Publish control",
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^My Caseload$/ })).toBeVisible();
  });

  test("7. America/Denver: evening shift stays on Sep 1 (not UTC Sep 2)", async ({ page }) => {
    await openAdminScheduler(page);
    await page.goto("/dashboard/scheduler", { waitUntil: "domcontentloaded" });
    await waitForSchedulerChrome(page);
    await goToSep1(page);
    await expect(page.locator("span.tabular-nums")).toContainText(/Sep(?:tember)?\s*1/i);
    await expandCode(page, "SEI");

    // 8pm MT Sep 1 is 02:00 UTC Sep 2. With timezoneId America/Denver it must
    // still appear on Tuesday Sep 1, not Wednesday.
    await expect(page.getByText(/8:00\s*PM/i).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("span.tabular-nums")).not.toContainText(/Sep(?:tember)?\s*2/i);
    await saveShot(page, "07-denver-evening-shift-sep1");
  });

  test("8. /dashboard/scheduling and /schedule-preview deep-link to the admin scheduler", async ({ page }) => {
    await openAdminScheduler(page);

    await page.goto("/dashboard/scheduling", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard\/scheduler/, { timeout: 20_000 });
    await waitForSchedulerChrome(page);
    await saveShot(page, "08a-scheduling-redirect");

    await page.goto("/dashboard/schedule-preview", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard\/scheduler/, { timeout: 20_000 });
    await waitForSchedulerChrome(page);
    await saveShot(page, "08b-schedule-preview-redirect");

    await page.goto("/dashboard/schedule-preview?focus=unaccepted-shifts", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(/\/dashboard\/scheduler/, { timeout: 20_000 });
    await waitForSchedulerChrome(page);
    await expect(page.getByText(/Get those published shifts accepted/i)).toBeVisible({
      timeout: 10_000,
    });
    await saveShot(page, "08c-schedule-preview-focus-banner");
  });
});
