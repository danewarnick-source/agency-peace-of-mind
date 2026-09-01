/**
 * Staff-facing hours for Caseload / Nectar / timesheet lists.
 *
 * Billing still uses effectiveBillingTimes() (needs_review is excluded until
 * a supervisor approves). Staff surfaces show the corrected span as soon as
 * the staff member edits it — even while the row is awaiting review.
 * Denied corrections fall back to the original raw clock span.
 */

import {
  durationMs,
  punchPair,
  type RecordPunchTimes,
} from "./record-duration.ts";

export function staffDisplayPunchPair(row: RecordPunchTimes): {
  in: string | null | undefined;
  out: string | null | undefined;
} {
  const status = (row.review_status ?? "").toLowerCase();
  if (status === "rejected") {
    return { in: row.clock_in_timestamp, out: row.clock_out_timestamp };
  }
  return punchPair(row);
}

/** Hours that count on staff screens. 0 when either stamp is missing. */
export function staffDisplayHours(row: RecordPunchTimes): number {
  const pair = staffDisplayPunchPair(row);
  if (!pair.in || !pair.out) return 0;
  const hrs = durationMs(pair.in, pair.out) / 3_600_000;
  return Number.isFinite(hrs) && hrs > 0 ? hrs : 0;
}

export function staffTimesheetStatus(row: {
  review_status?: string | null;
  clock_out_timestamp?: string | null;
}): string {
  if (!row.clock_out_timestamp) return "Open";
  const status = (row.review_status ?? "").toLowerCase();
  if (status === "needs_review") return "Awaiting supervisor approval";
  if (status === "rejected") return "Returned — original times stand";
  if (status === "approved") return "Approved";
  return "Submitted";
}
