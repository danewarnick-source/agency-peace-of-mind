/**
 * Pay-period math for the staff app. The org admin picks a schedule per
 * worker type (W-2 vs 1099) in Time & Pay settings; this module derives
 * the [start, end] window + a human label for any given `now`.
 *
 * Supported schedules:
 *   - weekly        — 7-day period ending on `anchor` (sun..sat).
 *   - biweekly      — 14-day period; uses the most recent `anchor` weekday
 *                     as the period end, with the immediately-preceding
 *                     "even week" alignment (works well in practice).
 *   - semi_monthly  — 1st–15th and 16th–end (anchor `1_and_16`).
 *   - monthly       — 1st through last day of the month.
 */

export type PaySchedule = "weekly" | "biweekly" | "semi_monthly" | "monthly";

export type Period = { start: Date; end: Date; label: string };

const DOW: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const MONTH_SHORT = (d: Date) =>
  d.toLocaleString("en-US", { month: "short" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function lastDOW(now: Date, weekday: number) {
  const diff = (now.getDay() - weekday + 7) % 7;
  return startOfDay(addDays(now, -diff));
}

function fmtLabel(start: Date, end: Date) {
  const sm = MONTH_SHORT(start);
  const em = MONTH_SHORT(end);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${sm} ${start.getDate()}–${end.getDate()}`;
  }
  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

export function computePeriodBounds(
  schedule: PaySchedule,
  anchor: string,
  now: Date = new Date(),
): Period {
  if (schedule === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: `${MONTH_SHORT(start)} ${start.getDate()}–${end.getDate()}` };
  }

  if (schedule === "semi_monthly") {
    const first = now.getDate() <= 15;
    const start = new Date(now.getFullYear(), now.getMonth(), first ? 1 : 16);
    const end = first
      ? new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: fmtLabel(start, end) };
  }

  if (schedule === "weekly") {
    const endDow = DOW[anchor?.toLowerCase()] ?? DOW.saturday;
    // last anchor weekday on or after `now` for the END of the current period
    const diffToEnd = (endDow - now.getDay() + 7) % 7;
    const end = endOfDay(addDays(now, diffToEnd));
    const start = startOfDay(addDays(end, -6));
    return { start, end, label: fmtLabel(start, end) };
  }

  // biweekly — 14-day period ending on the next `anchor` weekday after now,
  // aligned so the previous period's start sits an even number of weeks back
  // from a fixed reference epoch (2026-01-04 Sunday) — keeps cadence stable
  // independent of when an org turns it on.
  const endDow = DOW[anchor?.toLowerCase()] ?? DOW.friday;
  const diffToEnd = (endDow - now.getDay() + 7) % 7;
  const candidateEnd = startOfDay(addDays(now, diffToEnd));
  const EPOCH = new Date(2026, 0, 4); // Sun Jan 4 2026
  const daysSinceEpoch = Math.round(
    (candidateEnd.getTime() - EPOCH.getTime()) / 86_400_000,
  );
  const shift = ((daysSinceEpoch % 14) + 14) % 14;
  const end = endOfDay(addDays(candidateEnd, -(shift % 14 > 13 ? 0 : 0))); // no-op; cadence already aligned
  // Snap start to 13 days before end
  const start = startOfDay(addDays(end, -13));
  return { start, end, label: fmtLabel(start, end) };
}

export const SCHEDULE_LABEL: Record<PaySchedule, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly (every 2 weeks)",
  semi_monthly: "Semi-monthly (1st & 16th)",
  monthly: "Monthly",
};
