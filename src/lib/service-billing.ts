// Single source of truth for which service codes bill by the day vs. by
// the hour. Hourly codes accrue via EVV time punches (rate × hours). Daily
// codes pay once per completed attendance/daily-log day.
export const DAILY_SERVICE_CODES: ReadonlySet<string> = new Set([
  "HHS", "RHS", "DSG", "RL6", "RP3", "RP4", "RP5",
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
