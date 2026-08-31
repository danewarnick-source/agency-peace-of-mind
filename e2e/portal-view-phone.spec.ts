/**
 * Phone-sized Portal View: open the hamburger Sheet and tap Staff View.
 * The menu is portaled to document.body; without pointer-events-auto the
 * tap hits the Sheet overlay (the page behind the painted menu).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { installHiveMocks, screenshotPath } from "./helpers/admin-home-mock";

async function shot(page: Page, name: string) {
  try {
    fs.mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });
    await page.screenshot({ path: screenshotPath(name), fullPage: true });
  } catch {
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }).catch(() => {});
  }
}

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  storageState: { cookies: [], origins: [] },
});

async function openPortalViewMenu(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Loading workspace…")).toHaveCount(0, { timeout: 40_000 });
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open menu" }).tap();
  // Desktop aside stays in the DOM (hidden md:flex). Use the open Sheet.
  const trigger = page.locator("[role='dialog']").getByTestId("portal-view-trigger");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.tap();
  await expect(page.getByTestId("portal-view-menu")).toBeVisible();
  await shot(page, "portal_view_phone_menu_open");
}

test.describe("Portal View on a phone-sized viewport", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin", isExecutive: true });
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem("hive.session-hint", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("Staff View tap hits the menu, not the page behind", async ({ page }) => {
    await openPortalViewMenu(page);
    await expect(page.getByTestId("portal-view-option-staff")).toBeVisible();
    await expect(page.getByTestId("portal-view-option-admin")).toBeVisible();
    // hive_exec is the same button; SSR executive check is not mocked here.

    await page.getByTestId("portal-view-option-staff").tap();

    await expect(page.getByTestId("portal-view-menu")).toHaveCount(0);
    const stored = await page.evaluate(() => window.localStorage.getItem("portal-view"));
    expect(stored).toBe("staff");
    await shot(page, "portal_view_phone_after_staff_tap");
  });

  test("Admin View is tappable after switching away", async ({ page }) => {
    await openPortalViewMenu(page);
    await page.getByTestId("portal-view-option-staff").tap();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("portal-view"))).toBe(
      "staff",
    );

    // Staff phones use the avatar drawer, not the hamburger.
    await expect(page.getByRole("button", { name: "Open profile menu" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Open profile menu" }).tap();
    await page.locator("[role='dialog']").getByTestId("portal-view-trigger").tap();
    await page.getByTestId("portal-view-option-admin").tap();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("portal-view"))).toBe(
      "admin",
    );
  });

  test("staff phone has no leftover search glass and tabs start at top", async ({ page }) => {
    await openPortalViewMenu(page);
    await page.getByTestId("portal-view-option-staff").tap();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("portal-view"))).toBe(
      "staff",
    );

    await expect(page.getByRole("button", { name: "Open profile menu" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Open NECTAR search/i })).toHaveCount(0);
    await expect(page.locator("[data-caseload-search]")).toBeVisible();

    const scroller = page.locator("[data-staff-phone-scroller]");
    await expect(scroller).toBeVisible();
    await scroller.evaluate((el) => {
      el.scrollTop = 320;
    });
    await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.getByRole("link", { name: /^Schedule$/ }).tap();
    await expect.poll(async () => scroller.evaluate((el) => el.scrollTop)).toBe(0);
    await shot(page, "staff_phone_tab_schedule_from_top");
  });
});
