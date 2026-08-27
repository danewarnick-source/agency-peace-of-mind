/**
 * Admin Home + obligations / audit-readiness (Sep 1).
 *
 * Mocked True North admin session. Does not login to live staging and does
 * not mutate company_obligation_* rows. Read-only against the UI.
 *
 *   npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  installHiveMocks,
  screenshotPath,
  TNS_ORG_ID,
} from "./helpers/hive-mock";

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

async function assertNoCrash(page: Page, label: string) {
  const url = page.url();
  const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
  expect(body.length, `Blank page on ${label} (${url})`).toBeGreaterThan(20);
  expect(
    body,
    `Crash shell on ${label} (${url})`,
  ).not.toMatch(/Something went wrong in the dashboard shell/i);
  const crash = page.getByRole("heading", { name: /something went wrong/i });
  await expect(crash, `Unhandled error heading on ${label}`).toHaveCount(0);
}

test.describe("Admin Home + obligations / audit-readiness", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin" });
  });

  test("Admin Home loads audit-readiness cards and True North org", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/True North Supports/i).first()).toBeVisible();
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toBeVisible();
    await expect(page.getByText(/Staff with overdue obligations/i)).toBeVisible();
    await expect(page.getByText(/Policy acknowledgment rate/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Staff status/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Due soon/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Compliance by area/i })).toBeVisible();
    await assertNoCrash(page, "admin home");
    await shot(page, "admin-home");
  });

  test("Admin Home navigates to obligations, compliance desk, schedule, clients, staff", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 25_000,
    });

    const nav = page.locator("aside");
    await nav.getByRole("link", { name: /^Compliance$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/company-obligations/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toBeVisible({
      timeout: 15_000,
    });
    await assertNoCrash(page, "nav → compliance");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/EVV documentation rate/i)).toBeVisible({ timeout: 20_000 });
    await page.getByText(/EVV documentation rate/i).click();
    await expect(page).toHaveURL(/\/dashboard\/compliance-desk/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /EVV & Timesheet Control/i })).toBeVisible({
      timeout: 15_000,
    });
    await assertNoCrash(page, "nav → compliance desk");
    await shot(page, "compliance-desk");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("aside").getByRole("link", { name: /^Scheduler$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/scheduler/, { timeout: 15_000 });
    await assertNoCrash(page, "nav → scheduler");

    await page.locator("aside").getByRole("link", { name: /^Clients$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/hub\/clients/, { timeout: 15_000 });
    await assertNoCrash(page, "nav → clients");

    await page.locator("aside").getByRole("link", { name: /^Employees$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/hub\/employees/, { timeout: 15_000 });
    await assertNoCrash(page, "nav → employees");

    await page.locator("aside").getByRole("link", { name: /^Home$/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 15_000 });
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toBeVisible({ timeout: 15_000 });
  });

  test("Company obligations list: due / overdue / complete, filters, open read-only", async ({
    page,
  }) => {
    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Overdue items/i)).toBeVisible();
    await expect(page.getByText(/Emergency Management and Business Continuity Plan/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/CPR\/First Aid Certification — Initial/i)).toBeVisible();
    await expect(page.getByText(/1 overdue/i).first()).toBeVisible();
    await expect(page.getByText(/1 open · due/i).first()).toBeVisible();

    await page.getByRole("tab", { name: /Part I/i }).click();
    await expect(page.getByText(/Internal Quality Management Plan/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Satisfied/i).first()).toBeVisible();

    await page.getByRole("tab", { name: /Other duties/i }).click();
    await page.getByRole("button", { name: /^paused$/i }).click();
    await expect(page.getByText(/Staff handbook annual review/i)).toBeVisible();
    await page.getByRole("button", { name: /^active$/i }).click();
    await page.getByRole("tab", { name: /Work queue/i }).click();

    const search = page.getByPlaceholder(/search/i);
    if (await search.isVisible().catch(() => false)) {
      await search.fill("Emergency");
      await expect(
        page.getByText(/Emergency Management and Business Continuity Plan/i),
      ).toBeVisible();
      await search.fill("");
    }

    const card = page.locator("#obligation-e2e00000-0000-4000-a000-000000000021");
    await expect(card).toBeVisible();
    await card.getByRole("button").click();
    await page.getByRole("menuitem", { name: /View history/i }).click();
    await expect(page.getByText(/History — Emergency Management/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/All instances, most recent first/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await assertNoCrash(page, "company obligations");
    await shot(page, "company-obligations");
  });

  test("Deadlines route lands on Action Required without crashing", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/company-obligations/, { timeout: 15_000 });
    await expect(page.url()).toMatch(/tab=action-required/);
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Action Required/i })).toBeVisible();
    await assertNoCrash(page, "deadlines redirect");
    await shot(page, "deadlines-action-required");
  });

  test("My obligations is a different staff page; admin still sees company register", async ({
    page,
  }) => {
    await page.goto("/dashboard/my-obligations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /My Obligations/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Company requirements assigned to you/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toHaveCount(0);
    await assertNoCrash(page, "my-obligations");
    await shot(page, "my-obligations");

    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Emergency Management and Business Continuity Plan/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /My Obligations/i })).toHaveCount(0);
  });

  test("Command center and NECTAR focus banners do not error", async ({ page }) => {
    await page.goto("/dashboard/command-center", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Agency Command Center/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoCrash(page, "command-center");
    const nectarTab = page.getByRole("button", { name: /NECTAR Infusion/i });
    if (await nectarTab.isVisible().catch(() => false)) {
      await nectarTab.click();
      await page.waitForTimeout(500);
      await assertNoCrash(page, "command-center nectar tab");
    }
    await shot(page, "command-center");

    await page.goto("/dashboard/compliance-desk?focus=audit-readiness", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /EVV & Timesheet Control/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("region", { name: /NECTAR guidance/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Let's tighten up audit readiness/i)).toBeVisible();
    await assertNoCrash(page, "nectar focus banner");
    await shot(page, "nectar-focus-banner");
  });

  test("Related audit surfaces load (or honest locked/empty) without crashing", async ({
    page,
  }) => {
    await page.goto("/dashboard/internal-audit", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Internal Audit|is locked|Access denied/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await assertNoCrash(page, "internal-audit");
    await shot(page, "internal-audit");

    await page.goto("/dashboard/state-audit", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Audit Packages|State Audit|is locked|Access denied/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await assertNoCrash(page, "state-audit");
    await shot(page, "state-audit");

    await page.goto("/dashboard/audit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Audit$/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoCrash(page, "audit");
    await shot(page, "audit");
  });

  test("/admin entry sends True North admin to Admin Home", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toBeVisible({
      timeout: 20_000,
    });
    await assertNoCrash(page, "/admin entry");
  });
});

test.describe("Permission wall — DSP vs admin", () => {
  test("DSP does not get Admin Home or the company compliance register", async ({ page }) => {
    await installHiveMocks(page, { role: "employee" });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/My Caseload|My Day/i).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Compliance$/ })).toHaveCount(0);
    await shot(page, "dsp-home");

    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/You do not have permission to view the compliance register/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Compliance register/i })).toHaveCount(0);
    await shot(page, "dsp-company-obligations-wall");

    await page.goto("/dashboard/command-center", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Access denied/i })).toBeVisible({
      timeout: 20_000,
    });
    await shot(page, "dsp-command-center-wall");

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(page.url()).not.toMatch(/\/admin$/);
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
  });

  test("mocked org id is True North Supports", async () => {
    expect(TNS_ORG_ID).toBe("7fabcf5d-f826-487f-8730-8b0c3f1969bb");
  });
});
