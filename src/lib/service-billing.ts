// Single source of truth for which service codes bill by the day vs. by
// the hour. Hourly codes accrue in quarter-hour units from time punches
// (see billing-units.ts). Daily codes pay once per completed
// attendance/daily-log day.
//
// NOTE: RP3 is HOURLY — it is an EVV punch code (SOW §1.12), not a
// daily-rate code.
export const DAILY_SERVICE_CODES: ReadonlySet<string> = new Set([
  "HHS", "RHS", "PPS", "DSG", "RL6", "RP4", "RP5", "SED",
]);

export function isDailyServiceCode(code: string | null | undefined): boolean {
  return !!code && DAILY_SERVICE_CODES.has(code);
}

export function isHourlyServiceCode(code: string | null | undefined): boolean {
  return !!code && !DAILY_SERVICE_CODES.has(code);
}

export function billingUnitLabel(code: string | null | undefined): "Hourly" | "Daily" {
  return isDailyServiceCode(code) ? "Daily" : "Hourly";
}
