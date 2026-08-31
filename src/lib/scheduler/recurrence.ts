/**
 * Recurring-shift expansion and staff-calendar visibility.
 *
 * Hive stores each occurrence as a real `scheduled_shifts` row. Weekdays and
 * wall-clock times are America/Denver (Utah), never the server's local TZ and
 * never UTC `getDay()` / `setHours()`. A 10:00 AM Monday in Denver must stay
 * Monday even when the Node process is UTC.
 */
import {
  addCalendarMonths,
  daysInCalendarMonth,
  denverWallToIso,
  denverYmd,
  parseYmd,
  weekdaySunday0,
  ymdFromParts,
} from "../denver-date.ts";

export const SCHEDULER_TZ = "America/Denver";

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export type RecurrenceInput = {
  seedStartIso: string;
  seedEndIso: string;
  freq: RecurrenceFreq;
  /** 0=Sun … 6=Sat. Weekly only; empty → repeat the seed's Denver weekday. */
  weekdays?: number[];
  dayOfMonth?: number;
  /** Occurrences AFTER the seed (seed is already saved). */
  count: number;
  /** Inclusive YYYY-MM-DD in Denver. */
  untilYmd?: string | null;
};

export type RecurrenceOccurrence = {
  startsAt: string;
  endsAt: string;
  ymd: string;
};

const HARD_CAP = 200;
const MAX_SCAN_DAYS = 730;

export function addDaysYmd(ymd: string, delta: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const dt = new Date(p.year, p.month - 1, p.day + delta);
  return ymdFromParts(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function denverHourMinute(iso: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULER_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  let h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (h === 24) h = 0;
  return { h, m };
}

export function occurrenceSlotKey(
  staffId: string | null | undefined,
  clientId: string,
  startsAt: string,
): string {
  const { h, m } = denverHourMinute(startsAt);
  return `${staffId ?? ""}|${clientId}|${denverYmd(new Date(startsAt))}|${h}:${m}`;
}

/** Staff My Schedule / today widgets: hide cancelled only. Drafts stay visible. */
export function isStaffVisibleShiftStatus(status: string | null | undefined): boolean {
  return (status ?? "") !== "cancelled";
}

export type ShiftBarInput = {
  id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
};

export type ShiftBarLane<T extends ShiftBarInput> = T & {
  lane: number;
  lanes: number;
};

/**
 * One bar per (staff, start, end). Overlapping *different* staff (2:1)
 * stack in lanes so labels do not paint on top of each other.
 */
export function layoutShiftBars<T extends ShiftBarInput>(shifts: T[]): Array<ShiftBarLane<T>> {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const s of shifts) {
    const key = `${s.staff_id ?? "open"}|${s.starts_at}|${s.ends_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  const sorted = [...unique].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
  const laneEnd: number[] = [];
  const placed = sorted.map((s) => {
    const start = Date.parse(s.starts_at);
    const end = Date.parse(s.ends_at);
    let lane = laneEnd.findIndex((e) => e <= start);
    if (lane < 0) {
      lane = laneEnd.length;
      laneEnd.push(end);
    } else {
      laneEnd[lane] = end;
    }
    return { shift: s, lane };
  });
  const lanes = Math.max(1, laneEnd.length);
  return placed.map(({ shift, lane }) => ({ ...shift, lane, lanes }));
}

export function expandRecurringOccurrences(input: RecurrenceInput): RecurrenceOccurrence[] {
  const seedStart = new Date(input.seedStartIso);
  const seedEnd = new Date(input.seedEndIso);
  if (Number.isNaN(seedStart.getTime()) || Number.isNaN(seedEnd.getTime()) || seedEnd <= seedStart) {
    return [];
  }
  const durationMs = seedEnd.getTime() - seedStart.getTime();
  const seedYmd = denverYmd(seedStart);
  const { h, m } = denverHourMinute(input.seedStartIso);
  const cap = Math.min(Math.max(input.count, 0), HARD_CAP);
  const until = input.untilYmd && parseYmd(input.untilYmd) ? input.untilYmd : null;
  const out: RecurrenceOccurrence[] = [];

  const emit = (ymd: string) => {
    if (ymd === seedYmd) return;
    if (until && ymd > until) return false;
    const startsAt = denverWallToIso(ymd, h, m);
    out.push({
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + durationMs).toISOString(),
      ymd,
    });
    return true;
  };

  if (input.freq === "daily") {
    let ymd = seedYmd;
    for (let i = 0; i < cap; i++) {
      ymd = addDaysYmd(ymd, 1);
      if (until && ymd > until) break;
      emit(ymd);
    }
    return out;
  }

  if (input.freq === "monthly") {
    const seedParts = parseYmd(seedYmd);
    if (!seedParts) return [];
    const targetDom = input.dayOfMonth ?? seedParts.day;
    let year = seedParts.year;
    let month = seedParts.month;
    for (let i = 0; i < cap; i++) {
      const next = addCalendarMonths(year, month, 1);
      year = next.year;
      month = next.month;
      const ymd = ymdFromParts(year, month, Math.min(targetDom, daysInCalendarMonth(year, month)));
      if (until && ymd > until) break;
      emit(ymd);
    }
    return out;
  }

  const weekdays = (input.weekdays && input.weekdays.length > 0)
    ? Array.from(new Set(input.weekdays.filter((d) => d >= 0 && d <= 6))).sort()
    : [weekdaySunday0(seedYmd)];

  let ymd = seedYmd;
  let scanned = 0;
  while (out.length < cap && scanned < MAX_SCAN_DAYS) {
    ymd = addDaysYmd(ymd, 1);
    scanned++;
    if (until && ymd > until) break;
    if (weekdays.includes(weekdaySunday0(ymd))) {
      emit(ymd);
    }
  }
  return out;
}

export function denverWeekUtcBounds(weekStartIso: string): {
  startIso: string;
  endExclusiveIso: string;
} {
  const startYmd = denverYmd(new Date(weekStartIso));
  const endYmd = addDaysYmd(startYmd, 7);
  return {
    startIso: denverWallToIso(startYmd, 0, 0),
    endExclusiveIso: denverWallToIso(endYmd, 0, 0),
  };
}
