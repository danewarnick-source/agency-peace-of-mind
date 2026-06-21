/**
 * Fixed baseline list of required staff trainings.
 *
 * Every employee is checked against this list automatically — there is no
 * admin setup required. `getStaffChecklist` synthesizes a checklist row for
 * each applicable baseline training so a brand-new hire with nothing on file
 * shows Overdue / To-Do, never "0 overdue".
 *
 * Pure module — no DB, no server imports — safe to use from client or server.
 */

export type ConditionalRule = "all" | "behavior" | "abi" | "after_year_one";

export interface BaselineTraining {
  /** Stable key; checklist row synthesizes requirement_id = `baseline:<key>`. */
  key: string;
  title: string;
  /** Days from hire date that the employee has to complete the training. */
  due_days: number;
  /** Whether the certificate carries an expiration date that we track. */
  tracks_expiration: boolean;
  /** Default validity in months when an expiration is required but unknown. */
  default_validity_months: number | null;
  /** Who this training applies to. */
  conditional: ConditionalRule;
  /** Category used for grouping in the existing checklist UI. */
  category: string;
  /** Short hint shown in the UI. */
  hint?: string;
}

export const BASELINE_STAFF_TRAININGS: BaselineTraining[] = [
  {
    key: "thirty_day",
    title: "30-Day Training",
    due_days: 30,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "all",
    category: "Required trainings",
  },
  {
    key: "cpr_first_aid",
    title: "CPR & First Aid",
    due_days: 90,
    tracks_expiration: true,
    default_validity_months: 24,
    conditional: "all",
    category: "Required trainings",
    hint: "Combined CPR and First Aid certification.",
  },
  {
    key: "pct",
    title: "Person-Centered Thinking",
    due_days: 90,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "all",
    category: "Required trainings",
  },
  {
    key: "deescalation",
    title:
      "De-escalation Certification (MANDT, SOAR, CPI, PART, or Safety Care)",
    due_days: 180,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "behavior",
    category: "Required trainings",
    hint: "Required when assigned to a behavior-coded client (BC1/2/3) or anyone with a Behavior Support Plan.",
  },
  {
    key: "abi",
    title: "ABI Training",
    due_days: 90,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "abi",
    category: "Required trainings",
    hint: "Required when assigned to an ABI (acquired brain injury) client.",
  },
  {
    key: "annual_12h",
    title: "Ongoing Training (12 Hours)",
    due_days: 365,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "all",
    category: "Required trainings",
    hint: "Required every year after hire.",
  },
];

/** Lookup helper. */
export function baselineByKey(key: string): BaselineTraining | undefined {
  return BASELINE_STAFF_TRAININGS.find((t) => t.key === key);
}

/** Stable synthetic requirement_id used on the wire and in the UI. */
export function baselineRequirementId(key: string): string {
  return `baseline:${key}`;
}

/** Parse a synthetic requirement_id back to a baseline key. */
export function parseBaselineId(id: string): string | null {
  return id.startsWith("baseline:") ? id.slice("baseline:".length) : null;
}

export interface ApplicabilityContext {
  hireDate: Date | null;
  requiresDeescalation: boolean;
  requiresAbi: boolean;
  now?: Date;
}

/** Is this baseline training applicable to a given staffer right now? */
export function isBaselineApplicable(
  t: BaselineTraining,
  ctx: ApplicabilityContext,
): boolean {
  if (t.conditional === "all") return true;
  if (t.conditional === "behavior") return ctx.requiresDeescalation;
  if (t.conditional === "abi") return ctx.requiresAbi;
  if (t.conditional === "after_year_one") {
    if (!ctx.hireDate) return false;
    const now = ctx.now ?? new Date();
    const oneYearMs = 365 * 86400_000;
    return now.getTime() - ctx.hireDate.getTime() >= oneYearMs;
  }
  return false;
}

/** Compute due date (YYYY-MM-DD) from hire_date + due_days. */
export function dueDateFor(
  t: BaselineTraining,
  hireDate: Date | null,
): string | null {
  if (!hireDate) return null;
  const d = new Date(hireDate.getTime() + t.due_days * 86400_000);
  return d.toISOString().slice(0, 10);
}
