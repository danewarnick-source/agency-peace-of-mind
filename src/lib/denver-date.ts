/** America/Denver calendar helpers. HHS “today” is Mountain Time, not UTC. */

export const DENVER_TZ = "America/Denver";

export function denverYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DENVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function denverYmdFromInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return denverYmd(new Date(ms));
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Sunday=0 … Saturday=6 for a calendar YMD (not an instant). */
export function weekdaySunday0(ymd: string): number {
  const p = parseYmd(ymd);
  if (!p) return 0;
  return new Date(p.year, p.month - 1, p.day).getDay();
}

export function ymdFromParts(year: number, month1to12: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month1to12)}-${pad(day)}`;
}

export function addCalendarMonths(year: number, month1to12: number, delta: number): {
  year: number;
  month: number;
} {
  const idx = year * 12 + (month1to12 - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * UTC ISO for a wall-clock time on a Denver calendar date.
 * Used when writing eMAR scheduled_for from a daily-note date.
 */
export function denverWallToIso(ymd: string, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const utcGuess = Date.parse(`${ymd}T${pad(hh)}:${pad(mm)}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const gotH = Number(parts.find((p) => p.type === "hour")?.value ?? hh);
  const gotM = Number(parts.find((p) => p.type === "minute")?.value ?? mm);
  const deltaMin = gotH * 60 + gotM - (hh * 60 + mm);
  return new Date(utcGuess - deltaMin * 60_000).toISOString();
}

/** Inclusive month window as Denver midnights, expressed as UTC ISO for queries. */
export function denverMonthUtcBounds(year: number, month1to12: number): {
  startIso: string;
  endExclusiveIso: string;
} {
  const startYmd = ymdFromParts(year, month1to12, 1);
  const next = addCalendarMonths(year, month1to12, 1);
  const nextYmd = ymdFromParts(next.year, next.month, 1);
  return {
    startIso: denverWallToIso(startYmd, 0, 0),
    endExclusiveIso: denverWallToIso(nextYmd, 0, 0),
  };
}
