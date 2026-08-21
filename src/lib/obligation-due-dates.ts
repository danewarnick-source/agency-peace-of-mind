// Pure due-date engine for Company Obligations.
//
// Calendar math is UTC-only so a due date never drifts with the browser or
// server timezone. Period-following rules (DHHS91172 monthly summaries due
// the 15th of the *following* month; quarterly summaries due 15 days after
// quarter end) are first-class — they are not "the next 15th on the
// calendar", which is the bug that made SOW due dates untrustworthy.

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

export function addYearsUTC(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

export function addMonthsUTC(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

export function isoWeekday(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function nextWeekdayOnOrAfter(from: Date, weekday: number): Date {
  let d = from;
  for (let i = 0; i < 7; i++) {
    if (isoWeekday(d) === weekday) return d;
    d = addDaysUTC(d, 1);
  }
  return d;
}

export function mondayOfWeek(d: Date): Date {
  return addDaysUTC(d, -(isoWeekday(d) - 1));
}

export function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function monthlyOccurrence(year: number, month0: number, dayConfig: number | "last"): Date {
  const day = dayConfig === "last" ? lastDayOfMonth(year, month0) : Math.min(dayConfig, lastDayOfMonth(year, month0));
  return new Date(Date.UTC(year, month0, day));
}

export function formatShort(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}, ${d.getUTCFullYear()}`;
}

export function formatMonthYear(d: Date): string {
  return `${MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function endOfDayUTC(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)).toISOString();
}

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function normalizeDayConfig(v: unknown): number | "last" {
  if (v === "last") return "last";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 31) throw new Error("due_day_config.day_of_month must be 1-31 or 'last'.");
  return n;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export type PeriodResult = { period_key: string; due_at: string };

export type DueRule =
  | { kind: "weekly"; weekday: number }
  | { kind: "calendar_month"; due_day: number | "last"; period: "same_month" | "following_month" }
  | { kind: "calendar_quarter"; days_after_period_end: number }
  | { kind: "calendar_quarter_end" }
  | { kind: "calendar_year"; month: number; day: number | "last" }
  | { kind: "days_after_hire"; days: number }
  | { kind: "hire_anniversary"; start_year: number }
  | { kind: "cert_expiration"; fallback_months: number }
  | { kind: "days_after_assignment"; days: number }
  | { kind: "days_after_event"; days: number }
  | { kind: "days_after_service_start"; days: number }
  | { kind: "fixed_date"; date: string }
  | { kind: "standing" };

export function isCalendarDueRule(rule: DueRule): boolean {
  return (
    rule.kind === "weekly" ||
    rule.kind === "calendar_month" ||
    rule.kind === "calendar_quarter" ||
    rule.kind === "calendar_quarter_end" ||
    rule.kind === "calendar_year"
  );
}

export function explainDueRule(rule: DueRule): string {
  switch (rule.kind) {
    case "weekly":
      return `Due each ${WEEKDAY_NAMES[rule.weekday] ?? "week"}.`;
    case "calendar_month":
      if (rule.period === "following_month") {
        return `Covers the prior calendar month. Due the ${rule.due_day === "last" ? "last day" : ordinal(rule.due_day)} of the following month.`;
      }
      return `Due the ${rule.due_day === "last" ? "last day" : ordinal(rule.due_day)} of each month.`;
    case "calendar_quarter":
      return `Covers the prior calendar quarter. Due ${rule.days_after_period_end} day${rule.days_after_period_end === 1 ? "" : "s"} after quarter end (Apr 15, Jul 15, Oct 15, Jan 15).`;
    case "calendar_quarter_end":
      return "Must be completed during the quarter and documented by the last day of the quarter (Mar 31, Jun 30, Sep 30, Dec 31).";
    case "calendar_year": {
      const m = MONTHS_SHORT[rule.month - 1] ?? "?";
      return `Annual calendar due date: ${m} ${rule.day === "last" ? "last day" : ordinal(rule.day)}.`;
    }
    case "days_after_hire":
      return rule.days === 0
        ? "Required before the staff member provides services (or within a 30-day grace window if they were already employed when this requirement was added)."
        : `Due ${rule.days} days after the staff member's hire date.`;
    case "hire_anniversary":
      return rule.start_year <= 1
        ? "Due on each hire-date anniversary."
        : `Due on the hire-date anniversary starting year ${rule.start_year} (the year after hire).`;
    case "cert_expiration":
      return `Due on the expiration date printed on the current certificate. If that date cannot be read, renewal defaults to ${rule.fallback_months} months from the last verified upload.`;
    case "days_after_assignment":
      return `Due ${rule.days} days after the staff member is assigned to the client.`;
    case "days_after_event":
      return `Triggered by an event. Due ${rule.days} days after the event date.`;
    case "days_after_service_start":
      return `Due ${rule.days} days after the organization begins providing this service.`;
    case "fixed_date":
      return `One-time due date: ${formatShort(new Date(`${rule.date}T00:00:00Z`))}.`;
    case "standing":
      return "Standing record — keep current. There is no calendar due date; it is unmet when the file is missing or expired.";
  }
}

function quarterIndex(month0: number): number {
  return Math.floor(month0 / 3);
}

function quarterEndDate(year: number, q0: number): Date {
  const endMonth0 = q0 * 3 + 2;
  return monthlyOccurrence(year, endMonth0, "last");
}

function quarterStartDate(year: number, q0: number): Date {
  return new Date(Date.UTC(year, q0 * 3, 1));
}

function shiftQuarter(year: number, q0: number, delta: number): { year: number; q0: number } {
  const abs = year * 4 + q0 + delta;
  return { year: Math.floor(abs / 4), q0: ((abs % 4) + 4) % 4 };
}

/** Monthly due on day D of the month that *follows* the service month. */
function followingMonthPeriods(now: Date, dueDay: number | "last"): PeriodResult[] {
  const today = utcDay(now);
  const thisDue = monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth(), dueDay);
  const currentDue = thisDue.getTime() <= today.getTime()
    ? thisDue
    : monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth() - 1, dueDay);
  const nextDue = monthlyOccurrence(currentDue.getUTCFullYear(), currentDue.getUTCMonth() + 1, dueDay);

  const toPeriod = (due: Date): PeriodResult => {
    const service = addMonthsUTC(new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), 1)), -1);
    return {
      period_key: formatMonthYear(service),
      due_at: endOfDayUTC(due),
    };
  };
  return [toPeriod(currentDue), toPeriod(nextDue)];
}

function sameMonthPeriods(now: Date, dueDay: number | "last"): PeriodResult[] {
  const today = utcDay(now);
  const thisDue = monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth(), dueDay);
  const currentDue = thisDue.getTime() >= today.getTime()
    ? thisDue
    : monthlyOccurrence(today.getUTCFullYear(), today.getUTCMonth() + 1, dueDay);
  const prevDue = monthlyOccurrence(currentDue.getUTCFullYear(), currentDue.getUTCMonth() - 1, dueDay);
  const toPeriod = (due: Date): PeriodResult => ({
    period_key: formatMonthYear(due),
    due_at: endOfDayUTC(due),
  });
  // Include the most recently elapsed period if it is still the "current" unpaid
  // window (due date has passed this month).
  if (thisDue.getTime() < today.getTime()) {
    return [toPeriod(thisDue), toPeriod(currentDue)];
  }
  return [toPeriod(prevDue), toPeriod(currentDue)].filter((p, i, arr) =>
    arr.findIndex((x) => x.period_key === p.period_key) === i,
  );
}

function quarterAfterEndPeriods(now: Date, daysAfter: number): PeriodResult[] {
  const today = utcDay(now);
  const periods: PeriodResult[] = [];
  // Check the last two completed quarters + the quarter currently in progress.
  for (const delta of [-2, -1, 0]) {
    const { year, q0 } = shiftQuarter(today.getUTCFullYear(), quarterIndex(today.getUTCMonth()), delta);
    const end = quarterEndDate(year, q0);
    const due = addDaysUTC(end, daysAfter);
    if (due.getTime() < addDaysUTC(today, -120).getTime()) continue;
    const start = quarterStartDate(year, q0);
    periods.push({
      period_key: `Q${q0 + 1} ${year} (${formatMonthYear(start).split(" ")[0]}–${MONTHS_SHORT[end.getUTCMonth()]} ${year})`,
      due_at: endOfDayUTC(due),
    });
  }
  return dedupePeriods(periods).slice(-2);
}

function quarterEndPeriods(now: Date): PeriodResult[] {
  const today = utcDay(now);
  const periods: PeriodResult[] = [];
  for (const delta of [-1, 0]) {
    const { year, q0 } = shiftQuarter(today.getUTCFullYear(), quarterIndex(today.getUTCMonth()), delta);
    const end = quarterEndDate(year, q0);
    const start = quarterStartDate(year, q0);
    periods.push({
      period_key: `Q${q0 + 1} ${year} (${MONTHS_SHORT[start.getUTCMonth()]}–${MONTHS_SHORT[end.getUTCMonth()]})`,
      due_at: endOfDayUTC(end),
    });
  }
  return periods;
}

function annualPeriods(now: Date, month1: number, day: number | "last"): PeriodResult[] {
  const today = utcDay(now);
  const thisYear = monthlyOccurrence(today.getUTCFullYear(), month1 - 1, day);
  const current = thisYear.getTime() >= today.getTime()
    ? thisYear
    : monthlyOccurrence(today.getUTCFullYear() + 1, month1 - 1, day);
  const prev = monthlyOccurrence(current.getUTCFullYear() - 1, month1 - 1, day);
  const toPeriod = (due: Date): PeriodResult => ({
    period_key: `${due.getUTCFullYear()}`,
    due_at: endOfDayUTC(due),
  });
  if (thisYear.getTime() < today.getTime()) return [toPeriod(thisYear), toPeriod(current)];
  return [toPeriod(prev), toPeriod(current)];
}

function weeklyPeriods(now: Date, weekday: number): PeriodResult[] {
  const today = utcDay(now);
  const thisWeekDue = nextWeekdayOnOrAfter(mondayOfWeek(today), weekday);
  const current = thisWeekDue.getTime() >= today.getTime() ? thisWeekDue : addDaysUTC(thisWeekDue, 7);
  const prev = addDaysUTC(current, -7);
  const toPeriod = (due: Date): PeriodResult => {
    const monday = mondayOfWeek(due);
    return { period_key: `Week of ${formatShort(monday)}`, due_at: endOfDayUTC(due) };
  };
  return [toPeriod(prev), toPeriod(current)];
}

function dedupePeriods(periods: PeriodResult[]): PeriodResult[] {
  const seen = new Set<string>();
  const out: PeriodResult[] = [];
  for (const p of periods) {
    if (seen.has(p.period_key)) continue;
    seen.add(p.period_key);
    out.push(p);
  }
  return out.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
}

/**
 * Periods the generator should ensure exist for a calendar rule: the most
 * recently elapsed (possibly overdue) period and the next upcoming one.
 * Never backfills further than that — historical gaps are a one-time admin
 * decision, not an infinite catch-up.
 */
export function periodsToEnsure(rule: DueRule, now: Date = new Date()): PeriodResult[] {
  switch (rule.kind) {
    case "weekly":
      return weeklyPeriods(now, rule.weekday);
    case "calendar_month":
      return rule.period === "following_month"
        ? followingMonthPeriods(now, rule.due_day)
        : sameMonthPeriods(now, rule.due_day);
    case "calendar_quarter":
      return quarterAfterEndPeriods(now, rule.days_after_period_end);
    case "calendar_quarter_end":
      return quarterEndPeriods(now);
    case "calendar_year":
      return annualPeriods(now, rule.month, rule.day);
    case "fixed_date": {
      const due = new Date(`${rule.date}T00:00:00Z`);
      return [{ period_key: `Due ${formatShort(due)}`, due_at: endOfDayUTC(due) }];
    }
    default:
      return [];
  }
}

/** Next *upcoming or today* period — used when only one slot is needed. */
export function nextPeriod(rule: DueRule, now: Date = new Date()): PeriodResult | null {
  const all = periodsToEnsure(rule, now);
  const today = utcDay(now).getTime();
  const upcoming = all.find((p) => new Date(p.due_at).getTime() >= today);
  return upcoming ?? all[all.length - 1] ?? null;
}

/**
 * Infer a DueRule from the stored cadence + due_day_config JSON. Used for
 * provider-created obligations and as a fallback when the SOW catalog has
 * no overlay. Catalog rules win when present.
 */
export function dueRuleFromConfig(
  cadence: string,
  cfg: Record<string, unknown>,
): DueRule | null {
  switch (cadence) {
    case "weekly": {
      const weekday = Number(cfg.weekday);
      if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return null;
      return { kind: "weekly", weekday };
    }
    case "monthly": {
      const day = cfg.day_of_month === "last" ? "last" : Number(cfg.day_of_month);
      if (day !== "last" && (!Number.isFinite(day) || day < 1 || day > 31)) return null;
      const period = cfg.period === "following_month" || cfg.following_month === true
        ? "following_month"
        : "same_month";
      return { kind: "calendar_month", due_day: day as number | "last", period };
    }
    case "quarterly": {
      if (cfg.days_after_period_end !== undefined) {
        return { kind: "calendar_quarter", days_after_period_end: Number(cfg.days_after_period_end) };
      }
      if (cfg.at_period_end === true || cfg.day_of_month === "last") {
        return { kind: "calendar_quarter_end" };
      }
      // Legacy seed used day_of_month: 1 = first day of the quarter, which
      // is not how DHHS91172 writes quarterly deadlines. Treat "1st of
      // quarter" as quarter-end documentation for drills, and 15 as the
      // summary rule. Callers with a catalog overlay should not hit this.
      const day = Number(cfg.day_of_month);
      if (day === 15) return { kind: "calendar_quarter", days_after_period_end: 15 };
      return { kind: "calendar_quarter_end" };
    }
    case "annually": {
      if (cfg.days_after_hire !== undefined && cfg.every_n_months !== undefined) {
        return { kind: "days_after_hire", days: Number(cfg.days_after_hire) };
      }
      if (cfg.every_n_months !== undefined) {
        return { kind: "cert_expiration", fallback_months: Number(cfg.every_n_months) };
      }
      if (cfg.anniversary_based === true) {
        return { kind: "hire_anniversary", start_year: Math.max(1, Number(cfg.start_year ?? 1)) };
      }
      const month = Number(cfg.month);
      if (!Number.isFinite(month) || month < 1 || month > 12) return null;
      const day = cfg.day_of_month === "last" ? "last" : Number(cfg.day_of_month);
      if (day !== "last" && (!Number.isFinite(day) || day < 1 || day > 31)) return null;
      return { kind: "calendar_year", month, day: day as number | "last" };
    }
    case "one_time": {
      if (cfg.days_after_assignment !== undefined) {
        return { kind: "days_after_assignment", days: Number(cfg.days_after_assignment) };
      }
      if (cfg.days_after_hire !== undefined) {
        return { kind: "days_after_hire", days: Number(cfg.days_after_hire) };
      }
      if (cfg.days_after_service_start !== undefined) {
        return { kind: "days_after_service_start", days: Number(cfg.days_after_service_start) };
      }
      if (typeof cfg.date === "string" && cfg.date) {
        return { kind: "fixed_date", date: cfg.date };
      }
      return null;
    }
    case "per_event":
      return { kind: "days_after_event", days: Number(cfg.days_after_trigger ?? 0) };
    default:
      return null;
  }
}

/** Backward-compatible single next-period helper used by older call sites. */
export function computePeriod(
  cadence: string,
  cfg: Record<string, unknown>,
  now: Date,
): PeriodResult | null {
  const rule = dueRuleFromConfig(cadence, cfg);
  if (!rule) {
    if (cadence === "per_event") return null;
    throw new Error(`Unknown cadence: ${cadence}`);
  }
  if (rule.kind === "fixed_date") {
    const due = new Date(`${rule.date}T00:00:00Z`);
    return { period_key: `Due ${formatShort(due)}`, due_at: endOfDayUTC(due) };
  }
  if (!isCalendarDueRule(rule)) return null;
  return nextPeriod(rule, now);
}
