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

function denverYmdHm(date: Date): { ymd: string; h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  let h = num("hour");
  if (h === 24) h = 0;
  const ymd = `${String(num("year")).padStart(4, "0")}-${String(num("month")).padStart(2, "0")}-${String(num("day")).padStart(2, "0")}`;
  return { ymd, h, m: num("minute") };
}

/**
 * UTC ISO for a wall-clock time on a Denver calendar date.
 * Used when writing eMAR scheduled_for from a daily-note date, and for
 * scheduler week bounds (midnight must stay on that Denver calendar day).
 */
export function denverWallToIso(ymd: string, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const wantAsUtc = Date.parse(`${ymd}T${pad(hh)}:${pad(mm)}:00.000Z`);
  let utcMs = wantAsUtc;
  // Iterate so midnight (and DST) don't land on the previous Denver day.
  // Comparing YMD+HM as fake-UTC timestamps gives the wall-clock error.
  for (let i = 0; i < 4; i++) {
    const got = denverYmdHm(new Date(utcMs));
    const gotAsUtc = Date.parse(`${got.ymd}T${pad(got.h)}:${pad(got.m)}:00.000Z`);
    const delta = gotAsUtc - wantAsUtc;
    if (delta === 0) break;
    utcMs -= delta;
  }
  return new Date(utcMs).toISOString();
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
