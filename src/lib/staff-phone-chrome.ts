/**
 * Staff phone chrome — scroll + leftover-search invariants.
 *
 * Staff View on a phone scrolls inside StaffMobileShell's <main>
 * (`overflow-y-auto`), not the window. TanStack Router's
 * `scrollRestoration: true` only tracks window/document, so a tab tap
 * reuses the previous main.scrollTop and lands mid-page.
 *
 * Call `resetStaffPhoneScroll` on pathname change (layout effect, instant).
 *
 * Staff View also mounts a second desktop <Outlet /> behind `hidden md:grid`.
 * An `absolute` search glass in that hidden tree paints as a left-edge leftover
 * on WebKit. Unmount that duplicate after hydrate on a phone viewport.
 */

export const STAFF_PHONE_MQ = "(max-width: 767px)";

/** Bottom tab row (icon + label). Safe-area is extra, on the nav itself. */
export const STAFF_TAB_BAR_PX = 56;
/** Clocked-in strip height (timer + CLOCK OUT). */
export const STAFF_CLOCK_BAR_PX = 56;

/** Offset from the screen bottom to the top of the tab bar. */
export const STAFF_TAB_BAR_OFFSET_CSS =
  `calc(${STAFF_TAB_BAR_PX}px + env(safe-area-inset-bottom, 0px))`;

/** Offset from the screen bottom to the top of the clocked-in bar. */
export const STAFF_CLOCK_BAR_OFFSET_CSS =
  `calc(${STAFF_TAB_BAR_PX}px + env(safe-area-inset-bottom, 0px))`;

export function isStaffPhoneViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(STAFF_PHONE_MQ).matches;
}

export function shouldUnmountDuplicateStaffOutlet(isStaffPhoneChrome: boolean): boolean {
  return isStaffPhoneChrome && isStaffPhoneViewport();
}

export function resetStaffPhoneScroll(scroller: HTMLElement | null): void {
  if (scroller) {
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo(0, 0);
  }
}
