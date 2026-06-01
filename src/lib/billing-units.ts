// All hourly EVV services bill in quarter-hour units (1 unit = 15 min).
// 1 hour = 4 units.
export const UNITS_PER_HOUR = 4;

export const hoursToUnits = (hours: number): number =>
  Math.round(hours * UNITS_PER_HOUR);

export const unitsToHours = (units: number): number => units / UNITS_PER_HOUR;

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
