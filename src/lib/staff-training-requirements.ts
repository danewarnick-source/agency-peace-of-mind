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

export type ConditionalRule =
  | "all"
  | "behavior"
  | "abi"
  | "after_year_one"
  | "codes";

export interface BaselineValidationRule {
  /** Human-readable certificate type name Nectar expects to see. */
  cert_type_label: string;
  /** Each group must match — within a group, ANY of the keywords (case-insensitive substring) is enough. */
  required_keyword_groups: Array<{ label: string; any_of: string[] }>;
  requires_completion_date: boolean;
  requires_expiration_date: boolean;
}

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
  /**
   * Service codes that trigger applicability when `conditional === "codes"`.
   * Applies if the staffer is assigned (via staff_assignments.service_codes
   * across their active caseload) to ANY of these codes.
   */
  applies_to_codes?: string[];
  /** Category used for grouping in the existing checklist UI. */
  category: string;
  /** Short hint shown in the UI. */
  hint?: string;
  /** What Nectar must see on a valid certificate for this training. */
  validation: BaselineValidationRule;
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
    validation: {
      cert_type_label: "30-Day Training",
      required_keyword_groups: [
        {
          label: "30-day / new-hire training wording",
          any_of: [
            "30-day",
            "30 day",
            "thirty day",
            "thirty-day",
            "new hire",
            "new-hire",
            "orientation",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
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
    validation: {
      cert_type_label: "CPR & First Aid",
      required_keyword_groups: [
        { label: "CPR wording", any_of: ["cpr", "cardiopulmonary"] },
        { label: "First Aid wording", any_of: ["first aid", "first-aid"] },
      ],
      requires_completion_date: true,
      requires_expiration_date: true,
    },
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
    validation: {
      cert_type_label: "De-escalation",
      required_keyword_groups: [
        {
          label: "Accepted de-escalation program (MANDT/SOAR/CPI/PART/Safety Care)",
          any_of: [
            "mandt",
            "soar",
            "cpi",
            "crisis prevention",
            "part ",
            "safety care",
            "safety-care",
            "de-escalation",
            "deescalation",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
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
    validation: {
      cert_type_label: "ABI Training",
      required_keyword_groups: [
        {
          label: "ABI / Acquired Brain Injury wording",
          any_of: ["abi", "acquired brain injury", "brain injury"],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
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
    validation: {
      cert_type_label: "Ongoing / Annual Training",
      required_keyword_groups: [
        {
          label: "Ongoing / annual training wording",
          any_of: [
            "ongoing training",
            "annual training",
            "12 hour",
            "12-hour",
            "twelve hour",
            "continuing education",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
  },
  {
    key: "background_screening",
    title: "Background Screening",
    due_days: 14,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "all",
    category: "Required trainings",
    hint: "Required for every staff member. Renews annually from hire date.",
    validation: {
      cert_type_label: "Background Screening Approval",
      required_keyword_groups: [
        {
          label: "Background screening wording",
          any_of: [
            "background screening",
            "background check",
            "criminal history",
            "bci",
            "screening approval",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
  },
  {
    key: "medicaid_fraud_exclusion",
    title: "Medicaid Fraud Exclusion Check",
    due_days: 14,
    tracks_expiration: true,
    default_validity_months: 12,
    conditional: "all",
    category: "Required trainings",
    hint: "Required for every staff member. Checked annually — OIG search result + signed attestation.",
    validation: {
      cert_type_label: "Medicaid Fraud Exclusion Check",
      required_keyword_groups: [
        {
          label: "OIG / exclusion list wording",
          any_of: [
            "oig",
            "exclusion",
            "medicaid fraud",
            "leie",
            "excluded individuals",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
  },
  {
    key: "dhhs_code_of_conduct",
    title: "DHHS Code of Conduct",
    due_days: 30,
    tracks_expiration: false,
    default_validity_months: null,
    conditional: "codes",
    applies_to_codes: ["SLN", "SLH", "PPS", "HHS"],
    category: "Required trainings",
    hint: "One-time on hire, on file permanently. Applies to staff assigned to SLN, SLH, PPS, or HHS.",
    validation: {
      cert_type_label: "DHHS Code of Conduct",
      required_keyword_groups: [
        {
          label: "Code of Conduct wording",
          any_of: ["code of conduct", "dhhs"],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
  },
  {
    key: "acre_usu_workplace_support",
    title: "ACRE / USU Workplace Support Training",
    due_days: 90,
    tracks_expiration: false,
    default_validity_months: null,
    conditional: "codes",
    applies_to_codes: ["EPR", "SED", "SEE", "SEI"],
    category: "Required trainings",
    hint: "One-time. Applies to staff assigned to EPR, SED, SEE, or SEI.",
    validation: {
      cert_type_label: "ACRE / USU Workplace Support Training",
      required_keyword_groups: [
        {
          label: "ACRE / USU / Workplace Support wording",
          any_of: ["acre", "usu", "workplace support"],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: false,
    },
  },
  {
    key: "bcba_credential",
    title: "BCBA Credential",
    due_days: 90,
    tracks_expiration: true,
    default_validity_months: null,
    conditional: "codes",
    applies_to_codes: ["BC1", "BC2", "BC3"],
    category: "Required trainings",
    hint: "Applies to staff assigned to BC1, BC2, or BC3. Renewal tracks the credential's own expiration date — Nectar-verified.",
    validation: {
      cert_type_label: "BCBA Credential",
      required_keyword_groups: [
        {
          label: "BCBA / Board Certified Behavior Analyst wording",
          any_of: ["bcba", "board certified behavior analyst"],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: true,
    },
  },
  {
    key: "rn_lpn_license",
    title: "RN/LPN License",
    due_days: 90,
    tracks_expiration: true,
    default_validity_months: null,
    conditional: "codes",
    applies_to_codes: ["PN1", "PN2", "PM1", "PM2"],
    category: "Required trainings",
    hint: "Applies to staff assigned to PN1, PN2, PM1, or PM2. Renewal tracks the license's own expiration date — Nectar-verified.",
    validation: {
      cert_type_label: "RN/LPN License",
      required_keyword_groups: [
        {
          label: "RN / LPN license wording",
          any_of: [
            "registered nurse",
            "licensed practical nurse",
            "rn license",
            "lpn license",
            "nursing license",
          ],
        },
      ],
      requires_completion_date: true,
      requires_expiration_date: true,
    },
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
  /** Service codes the staffer is currently assigned to (from their active caseload). */
  assignedCodes?: string[];
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
  if (t.conditional === "codes") {
    const codes = t.applies_to_codes ?? [];
    if (codes.length === 0) return false;
    const assigned = (ctx.assignedCodes ?? []).map((c) => c.toUpperCase());
    return codes.some((c) => assigned.includes(c.toUpperCase()));
  }
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
