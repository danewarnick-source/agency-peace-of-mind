// All hourly EVV services bill in quarter-hour units (1 unit = 15 min).
// 1 hour = 4 units.
export const UNITS_PER_HOUR = 4;

export const hoursToUnits = (hours: number): number =>
  Math.round(hours * UNITS_PER_HOUR);

export const unitsToHours = (units: number): number => units / UNITS_PER_HOUR;

/**
 * Billable units for ONE time entry: round the entry's duration to the
 * NEAREST quarter hour (Math.round of duration / 15 min). Raw timestamps
 * are never altered — only the unit count is derived. Aggregations must
 * SUM per-entry units; never round a summed total of hours.
 * Returns 0 for null/invalid/negative inputs.
 */
export function computeEntryUnits(
  clockIn: string | number | Date | null | undefined,
  clockOut: string | number | Date | null | undefined,
): number {
  if (clockIn == null || clockOut == null) return 0;
  const inMs = new Date(clockIn).getTime();
  const outMs = new Date(clockOut).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return 0;
  return Math.max(0, Math.round((outMs - inMs) / 900_000));
}

// ─── Review-by-exception helpers (Timeclock pass) ────────────────────────────
//
// Every evv_timesheets row carries a `review_status` lifecycle column:
//   • 'clean'        — accepted as-is (raw times bill)
//   • 'needs_review' — staff used the correction flow OR incident_flag OR ≥16h:
//                      EXCLUDED from billable units / payroll until approved
//   • 'approved'     — supervisor accepted the correction. If corrected_* are
//                      present, those become the EFFECTIVE billing times;
//                      otherwise raw times bill
//   • 'rejected'     — supervisor sent the correction back to staff:
//                      EXCLUDED from billable units / payroll until resubmitted
//
// Raw clock_in_timestamp / clock_out_timestamp are NEVER mutated; corrections
// only live in corrected_clock_in / corrected_clock_out.
export type ReviewableTimesheetRow = {
  clock_in_timestamp: string | null | undefined;
  clock_out_timestamp: string | null | undefined;
  review_status?: string | null;
  corrected_clock_in?: string | null;
  corrected_clock_out?: string | null;
};

/**
 * Returns `true` when this timesheet may contribute to billable units /
 * payroll. Rows in `needs_review` or `rejected` are EXCLUDED until a
 * supervisor approves them.
 */
export function isBillableForReview(row: ReviewableTimesheetRow): boolean {
  const status = (row.review_status ?? "clean").toLowerCase();
  return status !== "needs_review" && status !== "rejected";
}

/**
 * The (in, out) pair to use for billing/payroll math. Returns `null` when
 * the row is excluded by review status. When status is 'approved' AND
 * corrected_* are present, the corrected times are used; otherwise raw
 * timestamps are used.
 */
export function effectiveBillingTimes(
  row: ReviewableTimesheetRow,
): { in: string; out: string } | null {
  if (!isBillableForReview(row)) return null;
  if (!row.clock_in_timestamp || !row.clock_out_timestamp) return null;
  const status = (row.review_status ?? "clean").toLowerCase();
  if (status === "approved" && row.corrected_clock_in && row.corrected_clock_out) {
    return { in: row.corrected_clock_in, out: row.corrected_clock_out };
  }
  return { in: row.clock_in_timestamp, out: row.clock_out_timestamp };
}

/**
 * Convenience wrapper: per-entry units honoring review_status + corrections.
 * Returns 0 when the row is not billable (needs_review / rejected / missing
 * times).
 */
export function computeBillableEntryUnits(row: ReviewableTimesheetRow): number {
  const t = effectiveBillingTimes(row);
  if (!t) return 0;
  return computeEntryUnits(t.in, t.out);
}

export const fmtHours = (h: number): string => h.toFixed(2);
export const fmtUnits = (u: number): string => Math.round(u).toLocaleString();
export const fmtUSD = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Color thresholds for utilization bars.
export type CapTone = "ok" | "warn" | "over";
export function capTone(usedPct: number, warnPct: number): CapTone {
  if (usedPct >= 100) return "over";
  if (usedPct >= warnPct) return "warn";
  return "ok";
}
