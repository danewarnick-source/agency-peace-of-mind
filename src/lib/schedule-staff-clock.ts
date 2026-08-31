/**
 * Staff Schedule clock-in gates. An open punch (client EVV or non-client
 * general) means this page must not offer a second clock-in. Shift cards
 * never show Open Time Clock — punch pad / Hub / Not-with-a-client is the clock.
 * Shift tap still opens the client Hub for viewing.
 */

export const SCHEDULE_NON_CLIENT_SECTION = "Not with a client";
export const SCHEDULE_NON_CLIENT_CLOCK_IN_TITLE = "Clock in";
export const SCHEDULE_NON_CLIENT_HELPER =
  "Working, but not at a client's home.";

export function scheduleHasOpenPunch(
  activeClientPunch: unknown,
  generalPunch: unknown,
): boolean {
  return !!activeClientPunch || !!generalPunch;
}

/** Staff schedule cards never deep-link to the punch pad. */
export function scheduleShiftOpensPunchPad(_opts?: {
  hasOpenPunch?: boolean;
  daily?: boolean;
}): boolean {
  return false;
}

/** Staff schedule cards never show an Open Time Clock CTA. */
export function scheduleShiftCta(_opts?: {
  hasOpenPunch?: boolean;
  daily?: boolean;
}): null {
  return null;
}

/** Group rows never show a Time Clock CTA. */
export function scheduleGroupRowCta(_opts?: {
  hasOpenPunch?: boolean;
  daily?: boolean;
}): null {
  return null;
}

/** Extra non-client card may start a punch only when nothing is already open. */
export function scheduleNonClientClockInAllowed(hasOpenPunch: boolean): boolean {
  return !hasOpenPunch;
}

/** Hide the DRAFT status pill on staff Schedule. Keep the shift itself. */
export function scheduleStaffHidesStatusBadge(
  status: string | null | undefined,
): boolean {
  return String(status ?? "").trim().toLowerCase() === "draft";
}
