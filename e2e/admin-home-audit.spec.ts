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
} from "./helpers/admin-home-mock";

test.use({ storageState: { cookies: [], origins: [] } });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await dumpPage(page, testInfo.title);
  }
});

const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";

async function shot(page: Page, name: string) {
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: screenshotPath(name), fullPage: true });
  } catch {
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }).catch(() => {});
  }
}

async function dumpPage(page: Page, label: string) {
  const info = await page
    .evaluate(() => ({
      href: location.href,
      body: (document.body?.innerText ?? "").slice(0, 400),
      org: localStorage.getItem("hive.activeOrgId"),
      view: localStorage.getItem("portal-view"),
      hasAuth: !!localStorage.getItem("sb-mmknqtdrefbzwfdtykza-auth-token"),
    }))
    .catch(() => null);
  // eslint-disable-next-line no-console
  console.log(`[e2e dump ${label}]`, info);
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

/** Cold Vite / SSR hydration can leave the shell on "Loading workspace…". One reload only. */
async function waitForAdminGreeting(page: Page) {
  const greeting = page.getByText(/Good (morning|afternoon|evening), Dana/i);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if (await greeting.isVisible().catch(() => false)) return;
  try {
    await expect(greeting).toBeVisible({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(greeting).toBeVisible({ timeout: 20_000 });
  }
}

test.describe("Admin Home + obligations / audit-readiness", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin" });
  });

  test("Admin Home loads obligation cards and True North org", async ({ page }) => {
    await waitForAdminGreeting(page);
    await expect(page.getByText(/True North Supports/i).first()).toBeVisible();
    await expect(page.getByTestId("shell-org-subtitle")).toHaveAttribute(
      "title",
      /True North Supports/,
    );
    await expect(page.getByTestId("this-week")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^This week$/i })).toBeVisible();
    await expect(page.getByTestId("decision-card")).toHaveCount(3);
    await expect(page.getByRole("link", { name: /1 more this week/i })).toBeVisible();
    await expect(page.getByTestId("quiet-line")).toBeVisible();
    await expect(page.getByTestId("already-assigned")).toBeVisible();
    await expect(page.getByText(/4 renewals · Staff notified · Due in 30 days/i)).toBeVisible();
    await expect(page.getByTestId("automation-line")).toBeVisible();
    await expect(page.getByText(/Automation: Last successful check unknown/i)).toBeVisible();
    await expect(page.getByRole("tab", { name: /What changed/i })).toHaveCount(0);
    await expect(page.getByText(/Handled without you:/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Compliance by area/i })).toHaveCount(0);
    await expect(page.getByText(/Staff with overdue/i)).toHaveCount(0);
    await expect(page.getByText(/Active clients/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Records review$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Command center$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Compliance desk$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Command center$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Records review$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Compliance desk$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^State Audit$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Reports$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /Agency Command Center/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /The day just got smaller/i })).toHaveCount(0);
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
    await expect(page.getByText(/Policy acknowledgment rate/i)).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: "Provider Interface" })).toBeVisible();
    await expect(page.getByTestId("admin-home-welcome")).toHaveCount(0);
    await assertNoCrash(page, "admin home");
    await shot(page, "admin-home");
  });

  test("This Week plan dialogs cover license, standing, overdue, and due-soon", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const week = page.getByTestId("this-week");
    await expect(week).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("already-assigned")).toBeVisible();
    await expect(week.getByText(/4 renewals · Staff notified · Due in 30 days/i)).toBeVisible();
    await expect(page.getByTestId("automation-line")).toBeVisible();
    await expect(page.getByText(/Automation: Last successful check unknown/i)).toBeVisible();
    await expect(week.getByText(/^Escalation$/i)).toHaveCount(0);
    await expect(week.getByText("License / repayment", { exact: true })).toHaveCount(0);
    await expect(week.getByText(/corrective action plan or repayment demand/i)).toHaveCount(0);
    await expect(week.getByText(/licensing or repayment item/i)).toHaveCount(0);
    await expect(week.getByText(/DHHS91172/i)).toHaveCount(0);
    await expect(week.getByText(/\d{4}-\d{2}-\d{2}/)).toHaveCount(0);
    await expect(week.getByRole("button", { name: "Log the renewal" })).toBeVisible();
    await expect(week.getByRole("button", { name: "Read and sign" })).toBeVisible();
    await expect(week.getByRole("button", { name: "Log a plan" })).toBeVisible();

    await week.getByRole("button", { name: "Log the renewal" }).click();
    await expect(page.getByRole("heading", { name: /License \/ repayment plan/i })).toBeVisible();
    await shot(page, "this-week-license-plan-dialog");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: /License \/ repayment plan/i })).toHaveCount(0);

    await week.getByRole("button", { name: "Read and sign" }).click();
    const standingDlg = page.getByRole("dialog", { name: /Standing record plan/i });
    await expect(standingDlg).toBeVisible();
    await standingDlg.locator("#standing-record-plan").fill("Write the discharge procedure and file it this week.");
    await standingDlg.locator("#standing-record-due").fill("2026-09-25");
    await shot(page, "this-week-standing-plan-dialog");
    await standingDlg.getByRole("button", { name: "Submit plan" }).click();
    await expect(standingDlg).toBeHidden();

    await week.getByRole("button", { name: "Log a plan" }).click();
    const overdueDlg = page.getByRole("dialog", { name: /Overdue obligation plan/i });
    await expect(overdueDlg).toBeVisible();
    await overdueDlg.locator("#overdue-obligation-plan").fill("Schedule the CE course and close the clock.");
    await shot(page, "this-week-overdue-plan-dialog");
    await overdueDlg.getByRole("button", { name: "Record plan" }).click();
    await expect(overdueDlg).toBeHidden();
    await shot(page, "this-week-plan-dialogs");
  });

  test("welcome=1 shows the Home banner above the greeting; Skip hides it", async ({ page }) => {
    await page.goto("/dashboard?welcome=1", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("admin-home-welcome");
    await expect(banner).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("heading", { name: /The day just got smaller/i })).toBeVisible();
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible();
    await expect(banner.getByRole("button", { name: /Skip — take me to my dashboard/i })).toBeVisible();
    await expect(banner.getByText(/You're set up\. This banner will close itself\./i)).toBeVisible();
    await expect(banner.getByRole("button", { name: /Go to my dashboard/i })).toBeVisible();
    const box = await banner.boundingBox();
    expect(box?.height ?? 999, "desktop banner stays near 280px").toBeLessThanOrEqual(300);
    await shot(page, "admin-home-welcome-banner");

    await banner.getByRole("button", { name: /Skip — take me to my dashboard/i }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible();
    await assertNoCrash(page, "admin home after skip welcome");
  });


  test("This week at 1280 is a single 820 column with Review day", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("this-week")).toBeVisible({ timeout: 25_000 });
    const col = page.getByTestId("home-column");
    const width = await col.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
    expect(width, "Home column stays at or under 820").toBeLessThanOrEqual(820);
    await expect(page.getByRole("heading", { name: /Compliance by area/i })).toHaveCount(0);
    await page.getByRole("tab", { name: /^Review day$/i }).click();
    await expect(page.getByTestId("review-day")).toBeVisible();
    await expect(page.getByTestId("review-day-meta")).toHaveText(
      /Q3 2026 · 2 sites · 4 people, 3 staff/,
    );
    await page.getByRole("button", { name: /Generate my DSPD review/i }).click();
    await expect(page.getByTestId("review-pack-text")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("review-pack-text")).toContainText(/This week review \(draft\)/);
    await shot(page, "home-this-week-web");
    await assertNoCrash(page, "admin home 1280");
  });

  test("This week at 390 keeps six card parts and unclipped tabs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("this-week")).toBeVisible({ timeout: 25_000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, "phone Home does not clip horizontally").toBeLessThanOrEqual(390);
    const tabs = page.getByTestId("home-tabs");
    const tabBox = await tabs.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(tabBox.scrollWidth, "tabs wrap or scroll inside 390").toBeLessThanOrEqual(390);
    const card = page.getByTestId("decision-card").first();
    await expect(card.getByTestId("decision-headline")).toBeVisible();
    await expect(card.getByTestId("decision-due")).toBeVisible();
    await expect(card.getByTestId("decision-why")).toBeVisible();
    await expect(card.getByTestId("decision-owner")).toBeVisible();
    await expect(card.getByTestId("decision-if-missed")).toBeVisible();
    await expect(card.getByTestId("decision-action")).toBeVisible();
    await shot(page, "home-this-week-phone");
    await assertNoCrash(page, "admin home 390");
  });

  test("Admin Home more-this-week link opens Compliance", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("this-week")).toBeVisible({ timeout: 25_000 });
    const more = page.getByRole("link", { name: /more this week/i });
    await expect(more).toBeVisible();
    await more.click();
    await expect(page).toHaveURL(/\/dashboard\/compliance/, { timeout: 15_000 });
    await assertNoCrash(page, "home → compliance");
    await shot(page, "admin-home-cta-staff");
  });

  test("Agency file: flags, encoded cards, Company policies sub-tab", async ({
    page,
  }) => {
    await page.goto("/dashboard/agency-documents", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/compliance/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Agency file$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: /Company policies/i })).toBeVisible();
    await expect(page.getByText(/Insurance/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/COI policy/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Onboarding/i })).toHaveCount(0);
    await assertNoCrash(page, "agency file");
    await shot(page, "agency-documents");

    await page.getByRole("tab", { name: /Company policies/i }).click();
    await expect(page.getByRole("heading", { name: /^Company policies$/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: /Template: Cell phone use/i })).toBeVisible();
    await shot(page, "company-policies");
  });

  test("Deadlines route lands on Staff file without crashing", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/compliance/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Staff file/i })).toBeVisible({
      timeout: 15_000,
    });
    await assertNoCrash(page, "deadlines redirect");
    await shot(page, "deadlines-personnel-file");
  });

  test("My obligations is a different staff page; admin still sees company register", async ({
    page,
  }) => {
    await page.goto("/dashboard/my-obligations", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /My tasks/i }).filter({ visible: true }).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Your submissions and certificates stay in your staff file/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Onboarding/i })).toHaveCount(0);
    await assertNoCrash(page, "my-obligations");
    await shot(page, "my-obligations");

    await page.goto("/dashboard/agency-documents", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/compliance/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Agency file$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Onboarding/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^Staff file$/i })).toHaveCount(0);
  });

  test("Command center redirects to Admin Home This week", async ({ page }) => {
    await page.goto("/dashboard/command-center", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/?(\?|$)/, { timeout: 15_000 });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("this-week")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Agency Command Center/i })).toHaveCount(0);
    await assertNoCrash(page, "command-center redirect");
    await shot(page, "command-center-redirect");

    await page.goto("/dashboard/compliance-desk?focus=audit-readiness", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /Records review/i })).toBeVisible({
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
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 20_000,
    });
    await assertNoCrash(page, "/admin entry");
  });
});

test.describe("Admin Home welcome — incomplete setup", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin", welcomeIncomplete: true });
  });

  test("welcome banner cards collapse to pills on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const banner = page.getByTestId("admin-home-welcome");
    await expect(banner).toBeVisible({ timeout: 25_000 });
    await expect(banner.getByRole("link", { name: /Add employee/i })).toBeVisible();
    await expect(banner.getByRole("link", { name: /Add client/i })).toBeVisible();
    await expect(banner.getByRole("link", { name: /Documentation/i })).toBeVisible();
    await expect(banner.getByTestId("welcome-chip-Invite staff")).toBeVisible();
    await expect(banner.getByTestId("welcome-chip-Add a client")).toBeVisible();
    await expect(banner.getByTestId("welcome-chip-Document a shift")).toBeVisible();
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible();
    await shot(page, "admin-home-welcome-mobile");
  });
});

test.describe("Permission wall — DSP vs admin", () => {
  test("DSP does not get Admin Home or the company compliance register", async ({ page }) => {
    await installHiveMocks(page, { role: "employee" });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("aside").getByRole("link", { name: /^My Caseload$/ })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("banner").getByRole("heading", { name: /My Caseload/i })).toBeVisible();
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /The day just got smaller/i })).toHaveCount(0);
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Agency documents$/ })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Compliance$/ })).toHaveCount(0);
    await shot(page, "dsp-home");

    await page.goto("/dashboard/agency-documents", { waitUntil: "domcontentloaded" });
    const wall = page.getByText(/You do not have permission to view the agency file/i);
    await expect(wall.last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /^Agency file$/i })).toHaveCount(0);
    await shot(page, "dsp-company-obligations-wall");

    await page.goto("/dashboard/command-center", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/?(\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Agency Command Center/i })).toHaveCount(0);
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toHaveCount(0);
    await shot(page, "dsp-command-center-redirect");

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(page.url()).not.toMatch(/\/admin$/);
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
  });

  test("mocked org id is True North Supports", async () => {
    expect(TNS_ORG_ID).toBe("7fabcf5d-f826-487f-8730-8b0c3f1969bb");
  });
});
