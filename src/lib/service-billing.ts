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

// Codes that staff CAN clock in on for payroll/evidence capture even though
// they may also have a daily-rate component (e.g. RHS — residential staff
// clock for payroll even though the client billing is daily; DSG/RL6/RP4/
// RP5/SED similarly capture time for payroll). The only codes excluded from
// staff clock-in are host/parent-paid daily rates with no agency clock
// component: HHS (host home) and PPS (professional parent supports).
const NON_CLOCKABLE_CODES: ReadonlySet<string> = new Set(["HHS", "PPS"]);

export function isClockableServiceCode(code: string | null | undefined): boolean {
  return !!code && !NON_CLOCKABLE_CODES.has(code);
}

// Day-program codes: DSG (Day Support — Group), DSP (Day Support — Individual),
// DSI (Day Support — Individual, intensive). These are scheduled via the day-
// program workflow and should NOT appear in the shift-picker service-code
// dropdown. HHS is daily-rate but NOT a day-program code.
const DAY_PROGRAM_CODES: ReadonlySet<string> = new Set(["DSG", "DSP", "DSI"]);

export function isDayProgramCode(code: string | null | undefined): boolean {
  return !!code && DAY_PROGRAM_CODES.has(code);
}

