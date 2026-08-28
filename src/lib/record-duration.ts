/**
 * Records Duration / In → Out labels.
 *
 * Duration is clock_out minus clock_in (corrected pair when a review
 * approved a correction). Do not ignore clock_out. A 10-day open punch
 * (live 30e77b63: Aug 16 evening Denver → Aug 27) is 243h 45m / 243.75h.
 *
 * Overnight wrap applies only when out is earlier than in by less than
 * 24h (same-date 10:00 PM → 2:00 AM). It must not collapse a multi-day
 * clock_out to a same-evening shift.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecordPunchTimes = {
  clock_in_timestamp: string | null | undefined;
  clock_out_timestamp: string | null | undefined;
  rounded_clock_in?: string | null;
  rounded_clock_out?: string | null;
  corrected_clock_in?: string | null;
  corrected_clock_out?: string | null;
  review_status?: string | null;
};

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function durationMs(
  inIso: string | null | undefined,
  outIso: string | null | undefined,
): number {
  if (!inIso || !outIso) return 0;
  const inMs = parseTimestampMs(inIso);
  let outMs = parseTimestampMs(outIso);
  if (inMs == null || outMs == null) return 0;
  if (outMs < inMs && inMs - outMs < DAY_MS) {
    outMs += DAY_MS;
  }
  return Math.max(0, outMs - inMs);
}

export function punchPair(row: RecordPunchTimes): {
  in: string | null | undefined;
  out: string | null | undefined;
} {
  const approved = (row.review_status ?? "").toLowerCase() === "approved";
  if (approved && row.corrected_clock_in && row.corrected_clock_out) {
    return { in: row.corrected_clock_in, out: row.corrected_clock_out };
  }
  return {
    in: row.corrected_clock_in || row.clock_in_timestamp,
    out: row.corrected_clock_out || row.clock_out_timestamp,
  };
}

/** Minutes for Duration and Billable hours. Uses the real clock_out. */
export function recordDurationMin(row: RecordPunchTimes): number {
  const punch = punchPair(row);
  return Math.round(durationMs(punch.in, punch.out) / 60_000);
}

export function localYmd(
  iso: string | null | undefined,
  timeZone?: string,
): string | null {
  const ms = parseTimestampMs(iso);
  if (ms == null) return null;
  const d = new Date(ms);
  if (!timeZone) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

function formatClock(
  iso: string,
  opts: { withDate: boolean; timeZone?: string },
): string {
  const ms = parseTimestampMs(iso);
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timeZone,
    ...(opts.withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatDay(iso: string, timeZone?: string, withYear = true): string {
  const ms = parseTimestampMs(iso);
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(new Date(ms));
}

/** In → Out. Includes both calendar dates when they are different local days. */
export function formatPunchRange(
  inIso: string | null | undefined,
  outIso: string | null | undefined,
  timeZone?: string,
): string {
  if (!inIso) return "—";
  if (!outIso) return `${formatClock(inIso, { withDate: false, timeZone })} → —`;
  const split = localYmd(inIso, timeZone) !== localYmd(outIso, timeZone);
  return `${formatClock(inIso, { withDate: split, timeZone })} → ${formatClock(outIso, { withDate: split, timeZone })}`;
}

/** Date column: one day, or a span when in/out fall on different local days. */
export function formatPunchDateSpan(
  inIso: string | null | undefined,
  outIso: string | null | undefined,
  timeZone?: string,
): string {
  if (!inIso) return "—";
  const inDay = formatDay(inIso, timeZone, true);
  if (!outIso || localYmd(inIso, timeZone) === localYmd(outIso, timeZone)) return inDay;
  return `${formatDay(inIso, timeZone, false)} – ${formatDay(outIso, timeZone, true)}`;
}

export function staffDisplayName(
  profile: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null | undefined,
): string {
  const full = (profile?.full_name ?? "").trim();
  if (full) return full;
  const parts = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return parts || "Staff";
}
