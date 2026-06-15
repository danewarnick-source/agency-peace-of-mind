// Single source of truth for which service codes bill by the day vs. by
// the hour. Hourly codes accrue in quarter-hour units from time punches
// (see billing-units.ts). Daily codes pay once per completed
// attendance/daily-log day.
//
// NOTE: RP3 is HOURLY — it is an EVV punch code (SOW §1.12), not a
// daily-rate code.
// NOTE: DSP is mode-dependent (qtr-hr OR daily) — handled in
// src/lib/day-program-billing.ts, NOT here. MTP is flat daily.
export const DAILY_SERVICE_CODES: ReadonlySet<string> = new Set([
  "HHS", "RHS", "PPS", "DSG", "RL6", "RP4", "RP5", "SED", "MTP",
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

// Codes that staff CAN clock in on for payroll/evidence capture even though
// they may also have a daily-rate component (e.g. RHS — residential staff
// clock for payroll even though the client billing is daily; DSG/RL6/RP4/
// RP5/SED similarly capture time for payroll). Excluded from staff
// clock-in: HHS (host home) and PPS (professional parent supports) — no
// agency clock component; and MTP — transport-only, logged on the day-
// program transport block, never a labor punch.
const NON_CLOCKABLE_CODES: ReadonlySet<string> = new Set(["HHS", "PPS", "MTP"]);

export function isClockableServiceCode(code: string | null | undefined): boolean {
  return !!code && !NON_CLOCKABLE_CODES.has(code);
}


