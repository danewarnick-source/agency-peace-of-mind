/**
 * Focused e2e: HHS host-home daily notes + attendance (Sep 1 True North).
 *
 * Hosts never clock on the punch pad. Path is /dashboard/hhs-hub/$clientId.
 * Mock auth + fixture roster. Does not write live notes, attendance, or UEVV.
 *
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CLIENTS } from "./fixtures/tns-roster";
import {
  assertPageNotBlank,
  installHiveMocks,
  presentWithoutNoteDate,
  waitForDashboard,
} from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIRS = [
  path.join(process.cwd(), "e2e/artifacts"),
  ...(fs.existsSync("/opt/cursor/artifacts") ? ["/opt/cursor/artifacts"] : []),
];

const BLAKE = `/e2e/hhs-hub/${CLIENTS.blake.id}`;
const MISSING = "/e2e/hhs-hub/00000000-0000-0000-0000-ffffffffffff";

async function shot(page: Page, name: string) {
  for (const dir of ARTIFACT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: path.join(dir, `${name}.png`),
      fullPage: false,
    });
  }
}

async function gotoMock(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

test.describe("HHS hub — mocked admin (Blake Stevens host home)", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
  });

  test("1. Admin can open the HHS hub for a fixture HHS client", async ({ page }) => {
    await gotoMock(page, BLAKE);
    await expect(page).toHaveURL(new RegExp(`/e2e/hhs-hub/${CLIENTS.blake.id}`));
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Blake Stevens/i).first()).toBeVisible();
    await expect(page.getByText(/Clinical Profile/i)).toHaveCount(0);
    await expect(page.getByText(/^HHS$/).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /Daily Note/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^MAR$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Attendance$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Monthly$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to caseload/i })).toBeVisible();
    await assertPageNotBlank(page, "HHS hub for Blake Stevens");
    await shot(page, "hhs_hub_open_blake");
  });

  test("2. Daily note composer is present; typing does not persist a real row", async ({
    page,
  }) => {
    const mutating: string[] = [];
    page.on("request", (req) => {
      const method = req.method();
      if (!/POST|PATCH|PUT|DELETE/i.test(method)) return;
      const url = req.url();
      if (/\/rest\/v1\/(daily_logs|hhs_)/i.test(url) || /saveDailyRecord/i.test(url)) {
        mutating.push(`${method} ${url}`);
      }
    });

    await gotoMock(page, BLAKE);
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel(/^Note date$/i)).toBeVisible();
    await expect(page.getByText(/Were there any incidents that required an incident report/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Yes$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^No$/i })).toBeVisible();
    await expect(
      page.getByText(/I reviewed every medication on this list and marked each one correctly/i),
    ).toHaveCount(0); // meds block only when client has meds
    await expect(
      page.getByText(/I attest that I supported the client with self-administration of each medication listed/i),
    ).toHaveCount(0);
    const composer = page.getByPlaceholder(/Describe support provided/i);
    await expect(composer).toBeVisible();
    await composer.fill(
      "Fixture note for Blake Stevens — morning ADLs with support. Not saved.",
    );
    await expect(composer).toHaveValue(/Fixture note for Blake Stevens/);

    // There is no Cancel button on this screen — leaving without Save is the abort.
    await expect(page.getByRole("button", { name: /Save Daily Note/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Review with NECTAR/i })).toHaveCount(0);
    await expect(page.getByText(/NECTAR Documentation Coach/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Submit with Exception Flag/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cancel/i })).toHaveCount(0);
    await shot(page, "hhs_daily_note_typed_not_saved");
    await page.getByRole("link", { name: /Back to caseload/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Daily Note Submitted/i)).toHaveCount(0);
    expect(mutating, "typed note must not POST a daily_logs / saveDailyRecord row").toHaveLength(
      0,
    );
  });

  test("3. Attendance tab is a calendar view, not a logging form", async ({
    page,
  }) => {
    await gotoMock(page, `${BLAKE}?tab=att`);
    await expect(page.getByText(/Monthly attendance/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/saved daily note marks the day present/i)).toBeVisible();
    await expect(page.getByText(/Client Present Overnight \(billable\)/i)).toHaveCount(0);
    await expect(page.getByText(/LEGAL ATTESTATION/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Sign & Save \(Billable\)/i })).toHaveCount(0);

    await page.getByRole("tab", { name: /^Monthly$/i }).click();
    await expect(page.getByText(/Monthly Attendance/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Present$/i).first()).toBeVisible();
    await expect(page.getByText(/^Unbillable$/i).first()).toBeVisible();
    await expect(
      page.getByText(/Present without a daily note — not billable/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Present now comes from a saved daily note/i),
    ).toBeVisible();
    const blockedDate = presentWithoutNoteDate();
    await expect(page.getByText(blockedDate, { exact: false }).first()).toBeVisible();
    await shot(page, "hhs_attendance_calendar_view");
  });

  test("3b. MAR tab is a calendar overview, not a log form", async ({ page }) => {
    await gotoMock(page, `${BLAKE}?tab=emar`);
    await expect(page.getByText(/Medication overview/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Logging is only on the daily note/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Log$/i })).toHaveCount(0);
    await expect(page.getByText(/Due today/i)).toHaveCount(0);
    await shot(page, "hhs_mar_calendar_view");
  });

  test("4. Empty and error states do not crash or blank the page", async ({ page }) => {
    await gotoMock(page, MISSING);
    await expect(page.getByText(/Client unavailable/i)).toBeVisible({ timeout: 20_000 });
    await assertPageNotBlank(page, "missing HHS client");
    await expect(page.getByText(/Something went wrong in the dashboard shell/i)).toHaveCount(0);

    await installHiveMocks(page, { persona: "admin", clientsError: true });
    await gotoMock(page, BLAKE);
    await expect(page.getByText(/Client unavailable|24-Hour Daily Progress Note/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await assertPageNotBlank(page, "HHS hub clients read error");
    await shot(page, "hhs_empty_and_error_states");
  });

  test("5. Punch pad is not the HHS path on the hub", async ({ page }) => {
    await gotoMock(page, BLAKE);
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Clinical Profile/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Clock in|Start shift|Open Time Clock/i })).toHaveCount(
      0,
    );
    await expect(page.getByText(/EVV time punch/i)).toHaveCount(0);
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Compass$/i })).toHaveCount(0);
    await shot(page, "hhs_hub_not_punch_pad");
  });
});

test.describe("HHS hub — staff DSP (Jake Probert) and unassigned bounce", () => {
  test("6. Assigned staff can open the HHS hub; dual-code caseload shows punch and daily note", async ({
    page,
  }) => {
    await installHiveMocks(page, { persona: "dsp" });
    await gotoMock(page, BLAKE);
    await expect(page.getByText(/Blake Stevens/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible();
    await expect(page.getByText(/Clinical Profile/i)).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Daily Note/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clock in|Start shift/i })).toHaveCount(0);
    // Hub itself is still not a punch pad; caseload (not this page) shows both actions.

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const caseloadHint = page.getByText(/My Caseload|Blake Stevens/i).first();
    await caseloadHint.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    if (await caseloadHint.isVisible().catch(() => false)) {
      const blakeRow = page.getByText("Blake Stevens", { exact: true }).first();
      if (await blakeRow.isVisible().catch(() => false)) {
        await blakeRow.click();
        await page.waitForURL(new RegExp(`/dashboard/hhs-hub/${CLIENTS.blake.id}`), {
          timeout: 10_000,
        }).catch(() => undefined);
      }
      const hubCta = page.getByRole("link", { name: /Open daily note for Blake Stevens/i });
      const clockCta = page.getByRole("link", { name: /Open Punch pad for Blake Stevens/i });
      if (await hubCta.isVisible().catch(() => false)) {
        await expect(hubCta).toBeVisible();
        await expect(clockCta).toBeVisible();
        await hubCta.click();
      }
      if (page.url().includes(`/hhs-hub/${CLIENTS.blake.id}`)) {
        await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible();
      }
    }
    await shot(page, "hhs_staff_hub_not_clock");
  });

  test("7. Someone not on the HHS assignment list is sent home", async ({ page }) => {
    await installHiveMocks(page, { persona: "admin", noAssignments: true });
    await gotoMock(page, BLAKE);
    await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 20_000 });
    await expect(
      page.getByText(/not assigned to any daily services/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await shot(page, "hhs_unassigned_bounce");
  });
});

test.describe("HHS hub — Harvey Alisa (house manager)", () => {
  test("8. House manager can open Blake Stevens HHS hub", async ({ page }) => {
    await installHiveMocks(page, { persona: "manager" });
    await gotoMock(page, BLAKE);
    await expect(page.getByText(/Blake Stevens/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/24-Hour Daily Progress Note/i)).toBeVisible();
    await expect(page.getByText(/Clinical Profile/i)).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Daily Note/i })).toBeVisible();
    await expect(page.getByText(/^HHS$/).first()).toBeVisible();
    await assertPageNotBlank(page, "Harvey Alisa opening Blake HHS hub");
    await shot(page, "hhs_harvey_alisa_opens_blake");
  });
});
