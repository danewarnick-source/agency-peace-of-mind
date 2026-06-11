/**
 * Minute-by-minute staffing count for one day at one home — the single
 * source for "how many staff are covering this home right now".
 *
 * Rules (DSPD residential model):
 *  • A BASE shift (parent_shift_id null) with a staff member adds +1 for
 *    its window.
 *  • A 1:1 SEGMENT (parent_shift_id set) pulls its staff OUT of home
 *    coverage for its window — the staff member is dedicated to one client
 *    (DSI/SEI etc.), not covering the home — so it subtracts 1 while it
 *    runs. Segments never ADD coverage.
 *  • Open shifts (no staff) contribute nothing.
 *  • Counts are clamped at 0.
 */
export type CoverageCountShift = {
  id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  parent_shift_id?: string | null;
};

export function coverageCountMinutes(
  dayStartMs: number,
  shifts: ReadonlyArray<CoverageCountShift>,
): number[] {
  const minutes = new Array(24 * 60).fill(0);
  const dayEndMs = dayStartMs + 24 * 3600 * 1000;
  const byId = new Map(shifts.map((s) => [s.id, s]));

  const apply = (s: CoverageCountShift, delta: number) => {
    const s0 = Math.max(new Date(s.starts_at).getTime(), dayStartMs);
    const s1 = Math.min(new Date(s.ends_at).getTime(), dayEndMs);
    if (s1 <= s0) return;
    const m0 = Math.floor((s0 - dayStartMs) / 60000);
    const m1 = Math.ceil((s1 - dayStartMs) / 60000);
    for (let i = m0; i < m1; i++) minutes[i] += delta;
  };

  for (const s of shifts) {
    if (!s.staff_id) continue;
    if (!s.parent_shift_id) {
      apply(s, +1);
      continue;
    }
    // Segment: subtract the staff from home coverage, but only when the
    // base shift it nests inside is part of this set (same staff) — i.e.,
    // the +1 we are cancelling was actually counted here.
    const parent = byId.get(s.parent_shift_id);
    if (parent && parent.staff_id === s.staff_id) apply(s, -1);
  }

  for (let i = 0; i < minutes.length; i++) {
    if (minutes[i] < 0) minutes[i] = 0;
  }
  return minutes;
}

/** Uncovered intervals (as fraction-of-day percentages) vs a required-count array. */
export function uncoveredBands(
  minutes: ReadonlyArray<number>,
  required: ReadonlyArray<number>,
): Array<{ left: number; width: number }> {
  const out: Array<{ left: number; width: number }> = [];
  let i = 0;
  const n = 24 * 60;
  while (i < n) {
    if ((required[i] ?? 0) > (minutes[i] ?? 0)) {
      const start = i;
      while (i < n && (required[i] ?? 0) > (minutes[i] ?? 0)) i++;
      out.push({ left: (start / n) * 100, width: ((i - start) / n) * 100 });
    } else i++;
  }
  return out;
}

/** Expand "HH:MM"-windowed requirements into a per-minute required count. */
export function requiredMinutes(
  requirements: ReadonlyArray<{ start_time: string; end_time: string; required_staff_count: number }>,
): number[] {
  const required = new Array(24 * 60).fill(0);
  for (const r of requirements) {
    const [sh, sm] = r.start_time.split(":").map(Number);
    const [eh, em] = r.end_time.split(":").map(Number);
    const a = sh * 60 + sm;
    const b = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em;
    for (let i = a; i < b; i++) required[i] = Math.max(required[i], r.required_staff_count);
  }
  return required;
}
