/**
 * Staff phone chrome — scroll + leftover-search invariants.
 *
 * Staff View on a phone scrolls inside StaffMobileShell's <main>
 * (`overflow-y-auto`), not the window. TanStack Router's
 * `scrollRestoration: true` only tracks window/document, so a tab tap
 * reuses the previous main.scrollTop and lands mid-page.
 *
 * Call `resetStaffPhoneScroll` on pathname change (layout effect, instant).
 */

export function resetStaffPhoneScroll(scroller: HTMLElement | null): void {
  if (scroller) {
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo(0, 0);
  }
}
