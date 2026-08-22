// Standing / previously-unseeded DHHS91172 duties. Inserted idempotently
// the first time an org opens the compliance register (and via SQL handoff
// for TNS). Titles must match sow-obligation-catalog.ts and DSPD_AUDIT_ITEMS.

export type StandingDutySeed = {
  title: string;
  description: string;
  source_policy_section: string;
  cadence: "weekly" | "monthly" | "quarterly" | "annually" | "per_event" | "one_time";
  due_day_config: Record<string, unknown>;
  reminder_days_before: number[];
  evidence_type: "attestation" | "upload" | "upload_and_attestation" | "form";
  attestation_text: string | null;
  requires_individual_completion: boolean;
  assignee_role: "any_assigned" | "managers_only" | "admin_only";
  scope: "org" | "staff" | "staff_per_client";
  target_service_codes: string[];
  /** When true, assigned_to_groups is set to the All Staff auto-group. */
  assign_all_staff: boolean;
};

export const STANDING_SOW_DUTIES: StandingDutySeed[] = [
  {
    title: "Emergency Management and Business Continuity Plan",
    description:
      "Keep a current Emergency Management and Business Continuity Plan on file (CST 46). This is a standing capability, not a recurring class.",
    source_policy_section: "CST 46",
    cadence: "per_event",
    due_day_config: {},
    reminder_days_before: [],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: false,
    assignee_role: "admin_only",
    scope: "org",
    target_service_codes: [],
    assign_all_staff: false,
  },
  {
    title: "Annual Emergency Management Plan Training",
    description:
      "Staff are trained at least annually on the Contractor's Emergency Management and Business Continuity Plan (CST 46). Separate from the 30-day orientation.",
    source_policy_section: "CST 46",
    cadence: "annually",
    due_day_config: { anniversary_based: true, start_year: 1 },
    reminder_days_before: [30, 14],
    evidence_type: "upload_and_attestation",
    attestation_text:
      "I attest that I have completed annual training on this organization's Emergency Management and Business Continuity Plan.",
    requires_individual_completion: true,
    assignee_role: "any_assigned",
    scope: "staff",
    target_service_codes: [],
    assign_all_staff: true,
  },
  {
    title: "Staff Conflict of Interest Process",
    description:
      "A written process for addressing staff conflict of interest (CST 9 & 10). Policy on file; not a per-period upload unless the policy changes.",
    source_policy_section: "CST 9 & 10",
    cadence: "per_event",
    due_day_config: {},
    reminder_days_before: [],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: false,
    assignee_role: "admin_only",
    scope: "org",
    target_service_codes: [],
    assign_all_staff: false,
  },
  {
    title: "Person Discharge Process",
    description:
      "Written discharge procedure for when a Person leaves services (SOW §1.22(c)). Triggered by a discharge, not a calendar.",
    source_policy_section: "SOW Article 1.22 (c)",
    cadence: "per_event",
    due_day_config: {},
    reminder_days_before: [],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: false,
    assignee_role: "admin_only",
    scope: "org",
    target_service_codes: [],
    assign_all_staff: false,
  },
  {
    title: "Internal Quality Management Plan",
    description:
      "Internal Quality Management Plan is followed and can be externally validated (CST 50).",
    source_policy_section: "CST 50",
    cadence: "per_event",
    due_day_config: {},
    reminder_days_before: [],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: false,
    assignee_role: "admin_only",
    scope: "org",
    target_service_codes: [],
    assign_all_staff: false,
  },
  {
    title: "General, Professional, and Automobile Liability Insurance",
    description:
      "Current General, Professional, and Automobile liability insurance at contracted minimums (CST 29–36). Track expiration on the declarations page.",
    source_policy_section: "CST 29–36",
    cadence: "annually",
    due_day_config: { month: 7, day_of_month: 1 },
    reminder_days_before: [60, 30, 14],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: false,
    assignee_role: "admin_only",
    scope: "org",
    target_service_codes: [],
    assign_all_staff: false,
  },
  {
    title: "DHHS Code of Conduct — Signed",
    description:
      "Staff assigned to SLN, SLH, HHS, or PPS have a signed DHHS Code of Conduct on file (CST 76).",
    source_policy_section: "CST 76",
    cadence: "one_time",
    due_day_config: { days_after_hire: 30 },
    reminder_days_before: [14, 7],
    evidence_type: "upload",
    attestation_text: null,
    requires_individual_completion: true,
    assignee_role: "any_assigned",
    scope: "staff",
    target_service_codes: ["SLN", "SLH", "HHS", "PPS"],
    assign_all_staff: true,
  },
  {
    title: "ABI Training — Before Working Alone",
    description:
      "Staff serving Persons with acquired brain injury complete ABI training before working alone (behavior effects, hospital-to-community transition, functional impact, health/medication, staff role, family perspective). SOW §1.8.",
    source_policy_section: "SOW Article 1.8 (ABI training)",
    cadence: "one_time",
    due_day_config: { days_after_hire: 0 },
    reminder_days_before: [14, 7, 3],
    evidence_type: "upload_and_attestation",
    attestation_text:
      "I attest that I have completed ABI training covering behavior effects, hospital-to-community transition, functional impact, health and medication, the staff role, and family perspective, and that I will not work alone with a Person with ABI until this is on file.",
    requires_individual_completion: true,
    assignee_role: "any_assigned",
    scope: "staff",
    target_service_codes: [],
    assign_all_staff: true,
  },
];

export const STANDING_SOW_TITLES = new Set(STANDING_SOW_DUTIES.map((d) => d.title));
