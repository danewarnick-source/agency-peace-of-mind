/**
 * Requirement Tracking — pure helpers (client + server safe).
 *
 * Provider declares cadence + how-they-track + when-last-verified for each
 * confirmed requirement. NECTAR stores, surfaces, and reminds — it does NOT
 * autonomously assert a cadence. If frequency is null/unset NECTAR stays
 * silent: no due/overdue is computed.
 *
 * Stored under nectar_requirements.metadata.tracking — no new table.
 */

export type RequirementFrequency =
  | "one_time"
  | "per_employee"
  | "per_shift"
  | "per_code"
  | "per_day"
  | "per_week"
  | "per_month"
  | "per_quarter"
  | "per_year"
  | "per_billing_rate_unit"
  | "ongoing";

export interface RequirementTracking {
  frequency: RequirementFrequency | null;
  /** Provider's own words on how they track it (free text). */
  tell_nectar_note: string | null;
  /** ISO date (YYYY-MM-DD) of the last provider-verified check. */
  last_checked_at: string | null;
  /** When/who last edited these tracking fields. */
  updated_at?: string | null;
  updated_by?: string | null;
}

export const FREQUENCY_OPTIONS: Array<{
  value: RequirementFrequency;
  label: string;
  hint: string;
}> = [
  { value: "one_time", label: "One-time", hint: "Set once, never recurs." },
  { value: "per_employee", label: "Per employee", hint: "Done once for each staff member." },
  { value: "per_shift", label: "Per shift", hint: "Done each shift." },
  { value: "per_code", label: "Per billing code", hint: "Done once per service code." },
  { value: "per_day", label: "Daily", hint: "Recheck every day." },
  { value: "per_week", label: "Weekly", hint: "Recheck every 7 days." },
  { value: "per_month", label: "Monthly", hint: "Recheck every 30 days." },
  { value: "per_quarter", label: "Quarterly", hint: "Recheck every 90 days." },
  { value: "per_year", label: "Yearly", hint: "Recheck every 365 days." },
  { value: "per_billing_rate_unit", label: "Per billing-rate unit", hint: "Tied to a billing unit event." },
  { value: "ongoing", label: "Ongoing", hint: "Continuously maintained; spot-check periodically." },
];

export function frequencyLabel(f: RequirementFrequency | null | undefined): string {
  if (!f) return "Not set";
  return FREQUENCY_OPTIONS.find((o) => o.value === f)?.label ?? f;
}

/** Days between "next due" and last_checked for date-based frequencies. */
const INTERVAL_DAYS: Partial<Record<RequirementFrequency, number>> = {
  per_day: 1,
  per_week: 7,
  per_month: 30,
  per_quarter: 90,
  per_year: 365,
  // Ongoing → soft 90-day spot-check cadence (provider chose "ongoing", so we
  // only nudge, never assert a hard rule).
  ongoing: 90,
};

export type DueState = "ok" | "due_soon" | "due" | "overdue" | "not_applicable" | "never_checked";

export interface ComputedDueState {
  state: DueState;
  /** ISO date string of when next re-check is due (null if N/A). */
  dueOn: string | null;
  /** Positive = overdue by N days; negative = due in -N days; null if N/A. */
  daysOverdue: number | null;
  frequency: RequirementFrequency | null;
  lastCheckedAt: string | null;
  tellNectarNote: string | null;
}

function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Accept both YYYY-MM-DD and full ISO timestamps.
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute due/overdue purely from provider-declared frequency + last_checked.
 * NECTAR refuses to compute a cadence if the provider hasn't declared one
 * (returns `not_applicable`). Event-driven cadences (per_employee/shift/code/
 * billing_rate_unit) are not date-based and return `not_applicable` here —
 * those are surfaced elsewhere when the matching event happens.
 */
export function computeRequirementDueState(
  metadata: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): ComputedDueState {
  const t = (metadata?.["tracking"] ?? {}) as Partial<RequirementTracking>;
  const frequency = (t.frequency ?? null) as RequirementFrequency | null;
  const lastCheckedAt = (t.last_checked_at ?? null) as string | null;
  const tellNectarNote = (t.tell_nectar_note ?? null) as string | null;

  const base = {
    frequency,
    lastCheckedAt,
    tellNectarNote,
    dueOn: null as string | null,
    daysOverdue: null as number | null,
  };

  if (!frequency || frequency === "one_time") {
    return { ...base, state: "not_applicable" };
  }

  // Event-driven cadences are not date-derived here.
  if (
    frequency === "per_employee" ||
    frequency === "per_shift" ||
    frequency === "per_code" ||
    frequency === "per_billing_rate_unit"
  ) {
    return { ...base, state: "not_applicable" };
  }

  const interval = INTERVAL_DAYS[frequency];
  if (!interval) return { ...base, state: "not_applicable" };

  const last = parseISODate(lastCheckedAt);
  if (!last) {
    // Provider set a cadence but has never recorded a check.
    return { ...base, state: "never_checked" };
  }

  const due = new Date(last.getTime() + interval * 86_400_000);
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86_400_000);

  let state: DueState = "ok";
  if (daysOverdue > 0) state = "overdue";
  else if (daysOverdue === 0) state = "due";
  else if (daysOverdue >= -7) state = "due_soon";

  return {
    ...base,
    state,
    dueOn: toISODate(due),
    daysOverdue,
  };
}
