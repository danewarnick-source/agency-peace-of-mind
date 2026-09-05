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

test.describe("Admin Home + obligations / audit-readiness", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin" });
  });

  test("Admin Home loads obligation cards and True North org", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(/True North Supports/i).first()).toBeVisible();
    await expect(page.getByText(/Staff with overdue/i)).toBeVisible();
    await expect(page.getByText(/Active clients/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Staff status/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Due soon/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Recommendations/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Compliance by area/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Command center$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compliance desk$/i })).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: /^Command center$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /^Compliance desk$/i })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: /Agency Command Center/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /The day just got smaller/i })).toHaveCount(0);
    await expect(page.getByLabel(/Audit readiness \d+ percent/i)).toHaveCount(0);
    await expect(page.getByText(/Policy acknowledgment rate/i)).toHaveCount(0);
    await expect(page.locator("aside").getByRole("link", { name: "Provider Interface" })).toBeVisible();
    await expect(page.getByTestId("admin-home-welcome")).toHaveCount(0);
    await assertNoCrash(page, "admin home");
    await shot(page, "admin-home");
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


  test("Admin Home scrolls — cards are reachable in the shell", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 25_000,
    });

    const home = page.getByTestId("admin-home-dashboard");
    await expect(home).toBeVisible();
    const overflowY = await home.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflowY, "Admin Home must not clip; shell main scrolls").not.toBe("hidden");

    const main = page.locator("main");
    const scroll = await main.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));
    expect(scroll.overflowY, "shell main is the scrollport").toMatch(/auto|scroll/);
    expect(scroll.scrollHeight, "Home content is taller than the shell").toBeGreaterThan(
      scroll.clientHeight,
    );

    const area = page.getByRole("heading", { name: /Compliance by area/i });
    await expect(area).not.toBeInViewport();
    await main.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(area).toBeInViewport();
    await shot(page, "admin-home-scrolled-cards");
    await assertNoCrash(page, "admin home scroll");
  });

  test("Admin Home navigates to obligations and staff from live cards", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Good (morning|afternoon|evening), Dana/i)).toBeVisible({
      timeout: 25_000,
    });

    const viewAll = page.getByRole("link", { name: /View all/i }).first();
    if (await viewAll.isVisible().catch(() => false)) {
      await viewAll.click();
      await expect(page).toHaveURL(/\/dashboard\/command-center#obligations/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: /Agency Command Center/i })).toBeVisible({
        timeout: 15_000,
      });
      await assertNoCrash(page, "home → command center obligations");
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Staff status/i })).toBeVisible({
      timeout: 20_000,
    });
    const jordan = page.getByRole("link", { name: /Jordan Lee/i }).first();
    if (await jordan.isVisible().catch(() => false)) {
      await jordan.click();
      await expect(page).toHaveURL(/\/dashboard\/employees\//, { timeout: 15_000 });
      await assertNoCrash(page, "home → staff");
    }
    await shot(page, "admin-home-cta-staff");
  });

  test("Company obligations pack grid: locked tabs, staff rows, green/red cells", async ({
    page,
  }) => {
    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Obligations$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Onboarding/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Credentials/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Client/i })).toBeVisible();

    await expect(page.getByText(/Code of Conduct/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Jordan Lee/i).first()).toBeVisible();

    await page.getByRole("button", { name: /Credentials/i }).click();
    await expect(page.getByText(/CPR \/ First Aid|30-day orientation/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /^Client$/i }).click();
    await expect(page.getByText(/Client-specific training/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const search = page.getByPlaceholder(/search staff/i);
    if (await search.isVisible().catch(() => false)) {
      await search.fill("Jordan");
      await expect(page.getByText(/Jordan Lee/i).first()).toBeVisible();
      await search.fill("");
    }

    await expect(page.getByRole("button", { name: /Add pack/i })).toBeVisible();
    await assertNoCrash(page, "company obligations");
    await shot(page, "company-obligations");
  });

  test("Deadlines route lands on Action Required without crashing", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/company-obligations/, { timeout: 15_000 });
    await expect(page.url()).toMatch(/tab=action-required/);
    await expect(page.getByRole("tab", { name: /Action Required/i })).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.getByRole("button", { name: /Onboarding/i })).toHaveCount(0);
    await assertNoCrash(page, "my-obligations");
    await shot(page, "my-obligations");

    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Obligations$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Onboarding/i })).toBeVisible();
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
    await expect(page.locator("aside").getByRole("link", { name: /^Compliance$/ })).toHaveCount(0);
    await shot(page, "dsp-home");

    await page.goto("/dashboard/company-obligations", { waitUntil: "domcontentloaded" });
    const wall = page.getByText(/You do not have permission to view obligations/i);
    await expect(wall.last()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /^Obligations$/i })).toHaveCount(0);
    await shot(page, "dsp-company-obligations-wall");

    await page.goto("/dashboard/command-center", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/unauthorized/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Access denied/i }).first()).toBeVisible();
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
