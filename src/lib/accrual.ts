/**
 * Shared accrual aggregator primitives.
 *
 * Pure helpers extracted from the duplicated grouping pattern in
 *   - src/lib/financial-revenue.functions.ts (getBilledRevenueByYear)
 *   - src/routes/dashboard.billing.form520.tsx (rows useMemo)
 *
 * IMPORTANT — this module owns ONLY the grouping/aggregation pattern.
 * Per-row primitives (entry → units, daily-code detection) stay in their
 * existing single-source modules:
 *   - computeEntryUnits      → @/lib/billing-units  (15-minute units)
 *   - isDailyServiceCode     → @/lib/service-billing
 *
 * Dollar math (units × rate, days × rate) stays in callers — these helpers
 * intentionally stop at units / day-sets so they can be reused by any caller
 * regardless of bucketing dimension or downstream shaping.
 *
 * UNIT MATH (Medicaid quarter-hour rule):
 *   • each ENTRY rounds to the NEAREST quarter hour — computeEntryUnits()
 *   • buckets SUM the per-entry units — a summed total is NEVER re-rounded
 *   • raw timestamps are never altered
 *   • skip timesheets whose service_type_code passes isDailyServiceCode()
 *   • skip timesheets missing clock_out_timestamp or with invalid/zero spans
 *   • daily: distinct record_date per bucket → units = set.size
 */

import { computeEntryUnits } from "@/lib/billing-units";
import { isDailyServiceCode } from "@/lib/service-billing";

export type TimesheetRow = {
  client_id: string;
  service_type_code: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
};

export type DailyRecordRow = {
  client_id: string;
  record_date: string;
};

/**
 * Aggregate hourly (non-daily) timesheets into units per caller-defined bucket.
 *
 * The caller supplies a `bucketKeyFn` that returns either a string key (the
 * row participates in that bucket) or `null` (skip this row entirely beyond
 * the standard skip conditions). This lets callers pick their own grouping
 * dimension — e.g. `(client|code)` for a single period, or
 * `(month|client|code)` for a 12-month rollup.
 *
 * Returns a Map of bucketKey → units. Units are computed PER ENTRY via
 * computeEntryUnits (round-to-nearest quarter hour) and SUMMED into the
 * bucket — never sum-hours-then-round.
 */
export function aggregateHourlyUnits(
  timesheets: ReadonlyArray<TimesheetRow>,
  bucketKeyFn: (row: TimesheetRow, hours: number, startDate: Date) => string | null,
): Map<string, number> {
  const unitsByKey = new Map<string, number>();
  for (const t of timesheets) {
    if (!t.service_type_code || !t.clock_out_timestamp) continue;
    if (isDailyServiceCode(t.service_type_code)) continue;
    const start = new Date(t.clock_in_timestamp);
    const end = new Date(t.clock_out_timestamp);
    const hrs = (end.getTime() - start.getTime()) / 3_600_000;
    if (!isFinite(hrs) || hrs <= 0) continue;
    const key = bucketKeyFn(t, hrs, start);
    if (key === null) continue;
    const units = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
    unitsByKey.set(key, (unitsByKey.get(key) ?? 0) + units);
  }
  return unitsByKey;
}

/**
 * Aggregate distinct daily-record dates into Sets per caller-defined bucket.
 *
 * Caller picks the bucket (e.g. `client_id`, or `${month}|${client_id}`).
 * Returns Map<bucketKey, Set<record_date>>. Caller reads `.size` for the
 * unit count (1 unit per distinct day).
 */
export function aggregateDailyDays(
  records: ReadonlyArray<DailyRecordRow>,
  bucketKeyFn: (row: DailyRecordRow) => string | null,
): Map<string, Set<string>> {
  const byKey = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.record_date) continue;
    const key = bucketKeyFn(r);
    if (key === null) continue;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(r.record_date);
  }
  return byKey;
}
