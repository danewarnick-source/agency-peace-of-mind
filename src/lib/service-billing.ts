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

// Short letter code for a stored client_billing_codes.unit_type value, for
// display only — never write the letter back as the stored value except via
// the canonical UNIT_TYPE_OPTIONS values below. Tolerant of the historical
// variants that exist across write paths ("unit", "Q", "day", "daily", "15min").
export type UnitTypeLetter = "Q" | "D" | "H";

export const UNIT_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string; letter: UnitTypeLetter }> = [
  { value: "Q", label: "Quarter-hour (15 min)", letter: "Q" },
  { value: "day", label: "Daily", letter: "D" },
  { value: "hourly", label: "Hourly", letter: "H" },
];

export function unitTypeLetter(
  unitType: string | null | undefined,
  code?: string | null,
): UnitTypeLetter {
  const v = (unitType ?? "").trim().toLowerCase();
  if (["day", "daily", "d"].includes(v)) return "D";
  if (["hour", "hourly", "h"].includes(v)) return "H";
  if (["unit", "q", "15min", "15 min", "quarter", "quarter-hour", "quarter_hour"].includes(v)) return "Q";
  if (code) return isDailyServiceCode(code) ? "D" : "Q";
  return "Q";
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

// Day-program codes: DSG (Day Support — Group), DSP (Day Support — Individual),
// DSI (Day Support — Individual, intensive). These are scheduled via the day-
// program workflow and should NOT appear in the shift-picker service-code
// dropdown. HHS is daily-rate but NOT a day-program code.
const DAY_PROGRAM_CODES: ReadonlySet<string> = new Set(["DSG", "DSP", "DSI"]);

export function isDayProgramCode(code: string | null | undefined): boolean {
  return !!code && DAY_PROGRAM_CODES.has(code);
}

