/**
 * Phone-width public landing hamburger.
 * Does not hit production. No webServer — setContent only.
 *
 * Recreates the live stacking: sticky blurred nav, hex layer, and a
 * Sonner-shaped top-right box. The old 40px button loses hit-testing to
 * that box (PR 204 class of bug). The fixed 44px control wins and opens
 * Sign in / Get started / section links.
 */
import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const SHARED_CSS = `
  body { margin: 0; font-family: sans-serif; background: #f4f6f8; color: #243040; }
  .nav {
    position: sticky; top: 0; z-index: 50; isolation: isolate; pointer-events: auto;
    border-bottom: 1px solid #d5dbe1;
    background: color-mix(in srgb, #f4f6f8 92%, transparent);
    backdrop-filter: blur(12px);
    padding-top: env(safe-area-inset-top, 0px);
  }
  .bar {
    position: relative; z-index: 10;
    display: flex; align-items: center; justify-content: space-between;
    min-height: 64px; padding: 0 16px;
  }
  .hex {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: repeating-linear-gradient(60deg, transparent, transparent 20px, rgba(201,162,39,0.12) 20px, rgba(201,162,39,0.12) 21px);
  }
  header.hero { position: relative; z-index: 0; min-height: 240px; }
  .old-btn {
    display: inline-flex; width: 40px; height: 40px;
    align-items: center; justify-content: center; border: 1px solid #d5dbe1;
  }
  .new-btn {
    position: relative; z-index: 20; display: inline-flex;
    width: 44px; height: 44px; min-width: 44px; min-height: 44px;
    align-items: center; justify-content: center;
    pointer-events: auto; touch-action: manipulation;
    border: 1px solid #d5dbe1; background: #f4f6f8;
    transform: translateZ(0);
  }
  .new-btn svg { pointer-events: none; }
  .toaster {
    position: fixed; top: 0; right: 0; z-index: 60;
    width: 120px; height: 80px;
  }
  #panel { display: none; padding: 12px 16px; border-top: 1px solid #d5dbe1; background: #f4f6f8; }
  #panel.open { display: block; }
`;

function hitIdAt(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top?.id || top?.tagName || null;
  });
}

test("old 40px hamburger loses the top-right corner to a toaster-shaped overlay", async ({ page }) => {
  await page.setContent(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${SHARED_CSS}</style></head>
<body>
  <nav class="nav">
    <div class="bar">
      <span>Hive</span>
      <button type="button" id="old-menu" class="old-btn" aria-label="Toggle menu">☰</button>
    </div>
  </nav>
  <header class="hero"><div class="hex"></div></header>
  <div id="toaster-dead" class="toaster"></div>
</body></html>`);

  expect(await hitIdAt(page, "#old-menu")).toBe("toaster-dead");
});

test("fixed 44px hamburger wins hit-testing and opens Sign in / Get started / section links", async ({
  page,
}) => {
  await page.setContent(`<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${SHARED_CSS}</style></head>
<body>
  <nav class="nav">
    <div class="bar">
      <span>Hive</span>
      <button type="button" id="new-menu" class="new-btn" aria-label="Open menu" aria-controls="panel" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="#243040" stroke-width="2"/></svg>
      </button>
    </div>
    <div id="panel">
      <a href="#nectar">Nectar</a>
      <a href="#compliance">Compliance</a>
      <a href="#documentation">Documentation</a>
      <a href="#scheduler">Scheduler</a>
      <a href="/login">Sign in</a>
      <a href="/signup">Get started</a>
    </div>
  </nav>
  <header class="hero"><div class="hex"></div><p>Hero</p></header>
  <div id="toaster-live" class="toaster" style="pointer-events:none"></div>
  <script>
    window.__hits = { neu: 0, toaster: 0 };
    document.getElementById("toaster-live").addEventListener("pointerdown", () => { window.__hits.toaster++; });
    const btn = document.getElementById("new-menu");
    const panel = document.getElementById("panel");
    btn.addEventListener("click", () => {
      window.__hits.neu++;
      const open = !panel.classList.contains("open");
      panel.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  </script>
</body></html>`);

  const box = await page.locator("#new-menu").boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width, "hit target width").toBeGreaterThanOrEqual(44);
  expect(box!.height, "hit target height").toBeGreaterThanOrEqual(44);

  expect(await hitIdAt(page, "#new-menu"), "hex / toaster must not cover the button").toBe(
    "new-menu",
  );

  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect(page.locator("#panel")).toHaveClass(/open/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nectar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compliance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();

  const hits = await page.evaluate(
    () => (window as unknown as { __hits: { neu: number; toaster: number } }).__hits,
  );
  expect(hits.neu, "tap must fire the landing toggle").toBe(1);
  expect(hits.toaster, "pointer-events-none toaster must not eat the tap").toBe(0);
});
