/**
 * Records Duration / Billable hours.
 *
 * The In → Out column shows punch wall-clock (corrected else raw). Duration
 * must use that same pair. Preferring `rounded_clock_*` silently added extra
 * calendar days when rounded_out's date disagreed with the punch (Tommy Jones
 * DSI: 7:56 PM → 11:41 PM displayed, Duration 243h 45m = 10d + 3h45m).
 *
 * Overnight wrap: if out is earlier than in by less than 24h, add one day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** If rounded span is more than this beyond the punch, trust the punch. */
const EXTRA_DAY_MS = 12 * 60 * 60 * 1000;

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
  // Overnight wrap (10:00 PM → 2:00 AM stored on the same calendar date).
  if (outMs < inMs && inMs - outMs < DAY_MS) {
    outMs += DAY_MS;
  }
  return Math.max(0, outMs - inMs);
}

function punchPair(row: RecordPunchTimes): {
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

/**
 * Minutes for the Records Duration column and the Billable hours total.
 * Uses the same punch pair as In → Out. Ignores rounded timestamps that
 * would add extra calendar days vs the displayed punch.
 */
export function recordDurationMin(row: RecordPunchTimes): number {
  const punch = punchPair(row);
  const punchMs = durationMs(punch.in, punch.out);

  const billIn = row.rounded_clock_in || punch.in;
  const billOut = row.rounded_clock_out || punch.out;
  const billMs = durationMs(billIn, billOut);

  const chosen =
    punchMs > 0 && billMs - punchMs > EXTRA_DAY_MS ? punchMs : billMs > 0 ? billMs : punchMs;
  return Math.round(chosen / 60_000);
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
