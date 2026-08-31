/**
 * Public marketing hamburger (landing + SiteHeader).
 *
 * Root cause (Dane, iPhone Safari, 2026-08-31): the three-bars control was
 * 40×40 (`h-10`) in the top-right of a sticky, backdrop-blurred, 92% opaque
 * nav. iOS hit-testing then missed the tap:
 *
 * 1. Apple HIG wants ~44px. The visible Lucide bars are ~20px; a finger on
 *    the chrome often lands on the nav/hero instead of the button.
 * 2. The hero hex layer and the Sonner toaster (`position: top-right`, high
 *    z-index) paint in that same corner. An empty toaster still occupies a
 *    box. Taps land on the overlay, not the toggle — same class of bug as
 *    Portal View tap-through (PR 204).
 * 3. `backdrop-filter` on a sticky parent plus an SVG-only child: iOS can
 *    target the icon and never synthesize a click on the <button>.
 *
 * PR 217 padded the nav below the status bar. Necessary, not sufficient.
 */

export const PUBLIC_MOBILE_MENU_MIN_PX = 44;

export const LANDING_MOBILE_NAV_ID = "landing-mobile-nav";

export const PUBLIC_MOBILE_MENU_BUTTON_CLASS = [
  "public-mobile-menu-btn",
  "relative z-20",
  "inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0",
  "touch-manipulation items-center justify-center",
  "rounded-md border border-[var(--hive-border)]",
  "bg-[var(--hive-bg)] text-[var(--hive-text)]",
  "pointer-events-auto md:hidden",
  "[&_svg]:pointer-events-none",
].join(" ");

export const PUBLIC_MARKETING_NAV_CLASS = [
  "sticky top-0 z-50 isolate pointer-events-auto",
  "border-b border-[var(--hive-border)]",
  "bg-[color-mix(in_srgb,var(--hive-bg)_92%,transparent)] backdrop-blur-md",
].join(" ");

export const PUBLIC_MARKETING_NAV_SAFE_AREA_STYLE = {
  paddingTop: "env(safe-area-inset-top, 0px)",
  paddingLeft: "env(safe-area-inset-left, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
} as const;
