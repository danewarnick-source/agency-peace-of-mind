/**
 * Phone-sized Portal View: open the hamburger Sheet and tap Staff View.
 * The menu is portaled to document.body; without pointer-events-auto the
 * tap hits the Sheet overlay (the page behind the painted menu).
 */
import { test, expect, type Page } from "@playwright/test";
import { installHiveMocks } from "./helpers/admin-home-mock";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  storageState: { cookies: [], origins: [] },
});

async function openPortalViewMenu(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Open menu" }).tap();
  const trigger = page.getByTestId("portal-view-trigger");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.tap();
  await expect(page.getByTestId("portal-view-menu")).toBeVisible();
}

test.describe("Portal View on a phone-sized viewport", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { role: "admin", isExecutive: true });
  });

  test("Staff View tap hits the menu, not the page behind", async ({ page }) => {
    await openPortalViewMenu(page);
    await expect(page.getByTestId("portal-view-option-staff")).toBeVisible();
    await expect(page.getByTestId("portal-view-option-admin")).toBeVisible();
    await expect(page.getByTestId("portal-view-option-hive_exec")).toBeVisible();

    await page.getByTestId("portal-view-option-staff").tap();

    await expect(page.getByTestId("portal-view-menu")).toHaveCount(0);
    const stored = await page.evaluate(() => window.localStorage.getItem("portal-view"));
    expect(stored).toBe("staff");
  });

  test("Admin View and Executive Command Center are tappable", async ({ page }) => {
    await openPortalViewMenu(page);
    await page.getByTestId("portal-view-option-hive_exec").tap();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("portal-view"))).toBe(
      "hive_exec",
    );

    await page.getByRole("button", { name: "Open menu" }).tap();
    await page.getByTestId("portal-view-trigger").tap();
    await page.getByTestId("portal-view-option-admin").tap();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("portal-view"))).toBe(
      "admin",
    );
  });
});
