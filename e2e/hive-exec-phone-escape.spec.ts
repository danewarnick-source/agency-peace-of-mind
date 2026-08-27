/**
 * Phone-width assertion for Command Center escape controls.
 * Does not hit production. No webServer — setContent only.
 */
import { test, expect } from "@playwright/test";
import {
  companyAdminSwitchAccessibleName,
  STAFF_VIEW_ACCESSIBLE_NAME,
} from "../src/lib/portal-view-landing";

test.use({ viewport: { width: 390, height: 844 } });

test("hive-exec phone chrome: Open company Admin is findable at 390x844", async ({ page }) => {
  const adminName = companyAdminSwitchAccessibleName("True North Supports");
  await page.setContent(`<!DOCTYPE html>
    <header>
      <button type="button" aria-label="Open menu">Menu</button>
      <button type="button" aria-label="${adminName}">${adminName}</button>
      <button type="button" aria-label="${STAFF_VIEW_ACCESSIBLE_NAME}">${STAFF_VIEW_ACCESSIBLE_NAME}</button>
    </header>
  `);
  await expect(page.getByRole("button", { name: /Open (company|.+) Admin/i })).toBeVisible();
  await expect(page.getByRole("button", { name: STAFF_VIEW_ACCESSIBLE_NAME })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});
