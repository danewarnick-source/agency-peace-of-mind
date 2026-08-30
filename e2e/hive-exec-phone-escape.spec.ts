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

/**
 * Root-cause fixture: a Radix modal Sheet sets pointer-events:none on body
 * and pointer-events:auto on the overlay. A menu portaled to body paints at
 * z-400 but inherits none — taps hit the page behind. pointer-events-auto
 * on the menu is the fix.
 */
test("portaled menu over a modal overlay receives the tap only when pointer-events-auto", async ({
  page,
}) => {
  await page.setContent(`<!DOCTYPE html>
    <html><body style="margin:0;pointer-events:none">
      <div id="page-behind" style="position:fixed;inset:0;z-index:50;pointer-events:auto;background:#fde68a">PAGE BEHIND</div>
      <div id="menu-dead" style="position:fixed;top:80px;left:16px;width:220px;z-index:400;background:#fff;border:1px solid #ccc">
        <button id="staff-dead" type="button" style="display:block;width:100%;padding:16px">Staff View dead</button>
      </div>
      <div id="menu-live" style="position:fixed;top:200px;left:16px;width:220px;z-index:400;pointer-events:auto;background:#fff;border:1px solid #ccc">
        <button id="staff-live" type="button" style="display:block;width:100%;padding:16px">Staff View live</button>
      </div>
      <script>
        window.__hits = { behind: 0, dead: 0, live: 0 };
        document.getElementById("page-behind").addEventListener("pointerdown", () => { window.__hits.behind++; });
        document.getElementById("staff-dead").addEventListener("pointerdown", () => { window.__hits.dead++; });
        document.getElementById("staff-live").addEventListener("pointerdown", () => { window.__hits.live++; });
      </script>
    </body></html>`);

  const hitAt = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top?.id ?? top?.tagName ?? null;
    });

  expect(await hitAt("#staff-dead"), "menu without pointer-events-auto loses hit-testing to the overlay").toBe(
    "page-behind",
  );
  expect(await hitAt("#staff-live"), "menu with pointer-events-auto wins hit-testing").toBe("staff-live");

  const liveBox = await page.locator("#staff-live").boundingBox();
  expect(liveBox).toBeTruthy();
  await page.touchscreen.tap(liveBox!.x + liveBox!.width / 2, liveBox!.y + liveBox!.height / 2);
  const hits = await page.evaluate(
    () => (window as unknown as { __hits: { behind: number; dead: number; live: number } }).__hits,
  );
  expect(hits.live, "tap on pointer-events-auto menu must reach Staff View").toBe(1);
});
