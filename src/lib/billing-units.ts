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
