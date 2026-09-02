/**
 * Hive Launchpad clock-in / sole-worker gate.
 *
 * `profiles.has_passed_launchpad` is the live product flag. A handful of
 * internal test accounts may have it flipped true in staging so QA can
 * exercise the punch pad — that is a TEST override, not real completion, and
 * must never be hardcoded as a product allow-list for client staff.
 */

export const LAUNCHPAD_CLOCK_IN_BLOCKED_MESSAGE =
  "Complete Launchpad before clocking in. Open Training to finish.";

export const LAUNCHPAD_ASSIGN_BLOCKED_MESSAGE =
  "This staff member has not completed Launchpad and cannot be assigned as a sole worker.";

export function launchpadBlockedMessage(purpose: "clock_in" | "assign" = "assign"): string {
  return purpose === "clock_in"
    ? LAUNCHPAD_CLOCK_IN_BLOCKED_MESSAGE
    : LAUNCHPAD_ASSIGN_BLOCKED_MESSAGE;
}
