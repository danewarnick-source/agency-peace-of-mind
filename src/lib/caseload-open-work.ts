/**
 * Caseload “do this now” matching.
 *
 * A scheduled time-clock shift leaves Earlier Today / Open shift after the
 * staff member has a clocked-out punch for that person + code whose
 * (corrected) window overlaps the scheduled window. Tomorrow’s shift is a
 * different window, so today’s punch does not hide it.
 */

import { staffDisplayPunchPair } from "./staff-display-hours.ts";
import type { RecordPunchTimes } from "./record-duration.ts";

export type CompletedPunch = RecordPunchTimes & {
  client_id: string;
  service_type_code: string | null;
  clock_out_timestamp: string | null;
};

export type ScheduledWindow = {
  id: string;
  client_id: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
};

/** Early/late punch slack so a 9:50 clock-in still closes a 10:00 start. */
const OVERLAP_SLACK_MS = 2 * 60 * 60 * 1000;

function codesMatch(jobCode: string | null | undefined, punchCode: string | null | undefined): boolean {
  const a = String(jobCode ?? "").trim().toUpperCase();
  const b = String(punchCode ?? "").trim().toUpperCase();
  if (!a || !b) return true;
  return a === b;
}

export function scheduledShiftIsClockedOut(
  shift: ScheduledWindow,
  punches: readonly CompletedPunch[],
): boolean {
  const start = Date.parse(shift.starts_at);
  const end = Date.parse(shift.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;

  return punches.some((punch) => {
    if (!punch.clock_out_timestamp) return false;
    if (punch.client_id !== shift.client_id) return false;
    if (!codesMatch(shift.job_code, punch.service_type_code)) return false;
    const pair = staffDisplayPunchPair(punch);
    if (!pair.in || !pair.out) return false;
    const pin = Date.parse(pair.in);
    const pout = Date.parse(pair.out);
    if (!Number.isFinite(pin) || !Number.isFinite(pout)) return false;
    return pin < end + OVERLAP_SLACK_MS && pout > start - OVERLAP_SLACK_MS;
  });
}

export function openClockableShifts<T extends ScheduledWindow>(
  shifts: readonly T[],
  punches: readonly CompletedPunch[],
): T[] {
  return shifts.filter((shift) => !scheduledShiftIsClockedOut(shift, punches));
}
