// Pack identity for the Utah DHHS91172 catalog (Step 1).
// Keys, disposition, and form/evidence templates live here so titles can
// rename without breaking audit links. Nightly pack apply is Step 2.

export const PACK_VERSION = "UT-2026.07";
export const PACK_STATE_CODE = "UT" as const;

export type ObligationDisposition =
  | "obligation"
  | "standing"
  | "intake"
  | "by_design"
  | "retired";

export type CatalogFormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "checkbox" | "date" | "attestation";
  required?: boolean;
};

export type CatalogFormTemplate = {
  key: string;
  title: string;
  fields: CatalogFormField[];
};

export type CatalogIdentity = {
  key: string;
  disposition: ObligationDisposition;
  retired_in?: string;
  aliases?: string[];
  evidence_template?: string;
  form_template?: CatalogFormTemplate;
};

export const STANDING_RECLASSIFY_REASON = "reclassified: standing record";

const ATTEST: CatalogFormField = {
  id: "attestation",
  label: "I attest this record is accurate and complete.",
  type: "attestation",
  required: true,
};

const CLIENT_SPECIFIC_FORM: CatalogFormTemplate = {
  key: "form.client_specific_training",
  title: "Client-specific training",
  fields: [
    {
      id: "disability_goals",
      label: "Disability, goals, and what matters to this person",
      type: "textarea",
      required: true,
    },
    {
      id: "medical_safety",
      label: "Medical / safety information staff must know",
      type: "textarea",
      required: true,
    },
    {
      id: "pcsp_bsp",
      label: "PCSP, BSP, and support-strategy responsibilities",
      type: "textarea",
      required: true,
    },
    {
      id: "dnr_hospice",
      label: "DNR / POLST / hospice instructions if applicable",
      type: "textarea",
    },
    ATTEST,
  ],
};

const SUPPORT_STRATEGIES_FORM: CatalogFormTemplate = {
  key: "form.support_strategies",
  title: "Support strategies",
  fields: [
    {
      id: "pcsp_goal",
      label: "PCSP goal this strategy supports",
      type: "textarea",
      required: true,
    },
    {
      id: "strategy",
      label: "What staff will do, how often, and how progress is seen",
      type: "textarea",
      required: true,
    },
    ATTEST,
  ],
};

const PCT_CLIENT_FORM: CatalogFormTemplate = {
  key: "form.pct_client",
  title: "Person-centered thinking (per client) — retired",
  fields: [
    {
      id: "what_matters",
      label: "What matters to this person (their words)",
      type: "textarea",
      required: true,
    },
    {
      id: "important_people",
      label: "Important people and who should be involved in decisions",
      type: "textarea",
      required: true,
    },
    {
      id: "communication",
      label: "How this person communicates and prefers to be supported",
      type: "textarea",
      required: true,
    },
    ATTEST,
  ],
};

const GRIEVANCE_FORM: CatalogFormTemplate = {
  key: "form.grievance_acknowledgment",
  title: "Grievance policy acknowledgment",
  fields: [
    {
      id: "explained_on",
      label: "Date the grievance policy was explained",
      type: "date",
      required: true,
    },
    {
      id: "person_or_rep",
      label: "Person (and representative, if any) who received the explanation",
      type: "text",
      required: true,
    },
    ATTEST,
  ],
};

const HOUSEMATE_FORM: CatalogFormTemplate = {
  key: "form.housemate_informed_choice",
  title: "Housemate informed-choice discussion",
  fields: [
    {
      id: "discussed_on",
      label: "Date of discussion",
      type: "date",
      required: true,
    },
    {
      id: "notes",
      label: "Who the Person lives with and household accommodations discussed",
      type: "textarea",
      required: true,
    },
    ATTEST,
  ],
};

const COC_FORM: CatalogFormTemplate = {
  key: "form.dhhs_code_of_conduct",
  title: "DHHS Code of Conduct — signed",
  fields: [
    { id: "signed_on", label: "Date signed", type: "date", required: true },
    ATTEST,
  ],
};

const DISCLOSURE_FORM: CatalogFormTemplate = {
  key: "form.medicaid_disclosure",
  title: "Medicaid disclosure form",
  fields: [
    { id: "completed_on", label: "Date completed", type: "date", required: true },
    ATTEST,
  ],
};

const SSI_FORM: CatalogFormTemplate = {
  key: "form.sei_ssi_benefits",
  title: "SEI SSI / benefits knowledge",
  fields: [
    {
      id: "knowledge",
      label: "I have basic knowledge of SSI, Title II, and Medicaid earned-income rules.",
      type: "checkbox",
      required: true,
    },
    ATTEST,
  ],
};

const ROOM_BOARD_FORM: CatalogFormTemplate = {
  key: "form.room_board_agreement",
  title: "Room-and-board / lease agreement",
  fields: [
    { id: "effective_on", label: "Effective date", type: "date", required: true },
    {
      id: "hcbs_note",
      label: "How this agreement meets HCBS Settings Rule standards",
      type: "textarea",
      required: true,
    },
    ATTEST,
  ],
};

/** Title → pack identity. Prefer 1b-ii + later standing / intake / by_design lists. */
export const CATALOG_IDENTITY_BY_TITLE: Record<string, CatalogIdentity> = {
  "30-Day New Hire Orientation Training": { key: "orientation_30_day", disposition: "obligation" },
  "Annual 12-Hour Continuing Education": { key: "ce_12h_annual", disposition: "obligation" },
  "CPR/First Aid Certification — Initial": { key: "cpr_first_aid_initial", disposition: "obligation" },
  "CPR/First Aid Certification — Renewal": { key: "cpr_first_aid_renewal", disposition: "obligation" },
  "Person-Centered Thinking and Practices Training": {
    key: "pct_hire_practices",
    disposition: "obligation",
    aliases: ["Person-Centered Thinking and Practices"],
  },
  "Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)": {
    key: "behavior_intervention_cert",
    disposition: "obligation",
  },
  "ACRE Training Certification — SEI": { key: "acre_sei", disposition: "obligation" },
  "ACRE Training Certification — SED": { key: "acre_sed", disposition: "obligation" },
  "ACRE Training Certification — SJD (60 Days)": { key: "acre_sjd", disposition: "obligation" },
  "Customized Employment Training (USU) — SEE/SJD": {
    key: "customized_employment_usu",
    disposition: "obligation",
  },
  "SEI — SSI/Benefits Knowledge Attestation": {
    key: "sei_ssi_benefits",
    disposition: "obligation",
    form_template: SSI_FORM,
  },
  "HSQ — Clean, Sanitary & Safe Environment Training": {
    key: "hsq_safe_environment",
    disposition: "obligation",
  },
  "DSPD New Caregiver Compensation Training — CMP/CMS": {
    key: "cmp_cms_caregiver_comp",
    disposition: "obligation",
  },
  "Background Screening — Annual": { key: "background_screening_annual", disposition: "obligation" },
  "Medicaid Fraud & Abuse Exclusion Screening — Annual": {
    key: "medicaid_exclusion_annual",
    disposition: "obligation",
  },
  "Medicaid Disclosure Form — Annual": {
    key: "medicaid_disclosure_annual",
    disposition: "obligation",
    form_template: DISCLOSURE_FORM,
  },
  "Educational Credentials and Licenses — On File": {
    key: "educational_credentials",
    disposition: "obligation",
  },
  "Training Documentation File — Maintained": {
    key: "training_file_maintained",
    disposition: "standing",
    evidence_template: "Complete, reviewable training file per staff member.",
  },
  "Driving Record — On File (Transporting Staff)": {
    key: "driving_record_transport",
    disposition: "obligation",
  },
  "Child Placing / Foster Care License (DHHS/OL) — PPS": {
    key: "pps_foster_license",
    disposition: "obligation",
  },
  "OL Residential Support License — 4+ Persons per Site": {
    key: "ol_rhs_license_4plus",
    disposition: "standing",
  },
  "OL Residential Support Certification — 3 or Fewer Persons per Site": {
    key: "ol_rhs_cert_3or_fewer",
    disposition: "standing",
  },
  "OL Day Treatment License — 4+ Persons": {
    key: "ol_day_tx_license_4plus",
    disposition: "standing",
  },
  "OL Day Support Certification — 3 or Fewer Persons": {
    key: "ol_day_support_cert_3or_fewer",
    disposition: "standing",
  },
  "USOR Approved Vendor — Job Coaching (SEI)": {
    key: "usor_job_coaching_sei",
    disposition: "obligation",
  },
  "USOR Approved Vendor — Job Development (SJD)": {
    key: "usor_job_development_sjd",
    disposition: "obligation",
  },
  "Zoning / Life Safety Code Compliance Documentation": {
    key: "zoning_life_safety",
    disposition: "standing",
  },
  "HHS Annual Outcome Report — Google Form Submission": {
    key: "hhs_annual_outcome",
    disposition: "obligation",
  },
  "SEI Monthly Summary — UPI Entry Attestation": {
    key: "sei_monthly_summary_upi",
    disposition: "obligation",
  },
  "SEI Employment Data — UPI Entry Attestation": {
    key: "sei_employment_data_upi",
    disposition: "obligation",
  },
  "SEI Employment Support Strategies — UPI Entry": {
    key: "sei_employment_strategies_upi",
    disposition: "obligation",
  },
  "SJD Monthly Summary — UPI Entry Attestation": {
    key: "sjd_monthly_summary_upi",
    disposition: "obligation",
  },
  "SJD Employment Data — UPI Entry Attestation": {
    key: "sjd_employment_data_upi",
    disposition: "obligation",
  },
  "SJD Monthly USOR Contact Verification": {
    key: "sjd_usor_contact_monthly",
    disposition: "obligation",
  },
  "CMP/CMS Monthly Summaries — Submitted to SC": {
    key: "cmp_cms_monthly_summaries",
    disposition: "obligation",
  },
  "HHS Quarterly Evacuation Drills — All Sites": {
    key: "hhs_evac_drills_quarterly",
    disposition: "obligation",
  },
  "RHS Quarterly Evacuation Drills — All Sites": {
    key: "rhs_evac_drills_quarterly",
    disposition: "obligation",
  },
  "PPS Quarterly Evacuation Drills — All Sites": {
    key: "pps_evac_drills_quarterly",
    disposition: "obligation",
  },
  "HHS Home Certification — Annual (DSPD Form)": {
    key: "hhs_home_cert_annual",
    disposition: "obligation",
  },
  "Client-Specific Training — [Client Name]": {
    key: "client_specific_training",
    disposition: "obligation",
    form_template: CLIENT_SPECIFIC_FORM,
  },
  "Support Strategies — [Client Name]": {
    key: "support_strategies",
    disposition: "obligation",
    form_template: SUPPORT_STRATEGIES_FORM,
  },
  "Person-Centered Thinking — [Client Name]": {
    key: "pct_client",
    disposition: "retired",
    retired_in: PACK_VERSION,
    aliases: ["Person-Centered Thinking"],
    form_template: PCT_CLIENT_FORM,
  },
  "Emergency Management and Business Continuity Plan": {
    key: "em_bcp_plan",
    disposition: "standing",
    evidence_template: "Current Emergency Management and Business Continuity Plan on file.",
  },
  "Annual Emergency Management Plan Training": {
    key: "em_bcp_training_annual",
    disposition: "obligation",
  },
  "Staff Conflict of Interest Process": {
    key: "conflict_of_interest_process",
    disposition: "standing",
    evidence_template: "Written staff conflict-of-interest process.",
  },
  "Person Discharge Process": {
    key: "person_discharge_process",
    disposition: "standing",
    evidence_template: "Written Person-discharge procedure.",
  },
  "Internal Quality Management Plan": {
    key: "iqmp",
    disposition: "standing",
    evidence_template: "Internal Quality Management Plan that can be externally validated.",
  },
  "General, Professional, and Automobile Liability Insurance": {
    key: "liability_insurance",
    disposition: "standing",
  },
  "DHHS Code of Conduct — Signed": {
    key: "dhhs_code_of_conduct_signed",
    disposition: "obligation",
    form_template: COC_FORM,
  },
  "ABI Training — Before Working Alone": { key: "abi_training", disposition: "obligation" },
  "DHHS Medicaid 101 Training — Contractor": {
    key: "medicaid_101_contractor",
    disposition: "obligation",
  },
  "Utah Medicaid Provider Manuals — Annual Memo": {
    key: "medicaid_manuals_memo",
    disposition: "obligation",
  },
  "Volunteer Training File — When Volunteers Are Used": {
    key: "volunteer_training_file",
    disposition: "standing",
  },
  "USTEPS and UPI Contractor Accounts": { key: "usteps_upi_accounts", disposition: "standing" },
  "Medicaid Provider Enrollment — Current": { key: "medicaid_enrollment", disposition: "standing" },
  "Medicaid Provider Change Notifications": {
    key: "medicaid_change_notifications",
    disposition: "standing",
  },
  "No Gifts or Purchases-from-Staff Process": {
    key: "no_gifts_process",
    disposition: "standing",
    evidence_template:
      "Written process: contractor and staff do not accept money from a Person and do not let a Person make purchases from the contractor or staff.",
  },
  "Governing or Policy-Making Board Records": {
    key: "governing_board_records",
    disposition: "standing",
  },
  "Personnel Policies and Job Descriptions": {
    key: "personnel_policies",
    disposition: "standing",
    evidence_template: "Current personnel policies and written job descriptions for every staff position.",
  },
  "Operating Policies and Procedures": {
    key: "operating_policies",
    disposition: "standing",
    evidence_template: "Current operating policies covering SOW §1.18 elements.",
  },
  "Human Rights Plan": {
    key: "human_rights_plan",
    disposition: "standing",
    evidence_template: "Written Human Rights Plan (HCBS Settings Rule).",
  },
  "Health Support Policies and Procedures": {
    key: "health_support_policies",
    disposition: "standing",
  },
  "Housemate Informed-Choice Discussion": {
    key: "housemate_informed_choice",
    disposition: "intake",
    form_template: HOUSEMATE_FORM,
  },
  "DSI Annual Outcome Report — Google Form Submission": {
    key: "dsi_annual_outcome",
    disposition: "obligation",
  },
  "SEI Annual Outcome Report — Google Form Submission": {
    key: "sei_annual_outcome",
    disposition: "obligation",
  },
  "Supported Living Annual Outcome Report — Google Form Submission": {
    key: "sl_annual_outcome",
    disposition: "obligation",
  },
  "Utah Department of Commerce — Entity Standing": {
    key: "commerce_entity_standing",
    disposition: "standing",
  },
  "DHHS Code of Conduct — Posted": {
    key: "dhhs_code_of_conduct_posted",
    disposition: "standing",
  },
  "Business Associate Agreements — On File": { key: "baa_on_file", disposition: "standing" },
  "Large-Loan Disclosure Process": {
    key: "large_loan_disclosure_process",
    disposition: "standing",
  },
  "Incident Reporting Process": {
    key: "incident_reporting_process",
    disposition: "standing",
    evidence_template: "Written incident reporting process.",
  },
  "HIPAA Notice of Privacy Practices": { key: "hipaa_npp", disposition: "standing" },

  // ── Review-tool / intake / by_design (1b table) ─────────────────────────
  "Human Rights Committee — Established and Meeting": {
    key: "hrc_committee",
    disposition: "by_design",
  },
  "EPR Community Time — 20 Percent Process": {
    key: "epr_community_20pct",
    disposition: "by_design",
  },
  "Medical and Dental Examinations — Person File": {
    key: "medical_dental_exams",
    disposition: "intake",
  },
  "Medication Record — When Contractor Supports Meds": {
    key: "medication_record",
    disposition: "by_design",
  },
  "Functional Behavior Assessment and Behavior Support Plan": {
    key: "fba_bsp",
    disposition: "by_design",
  },
  "Grievance Policy Acknowledgment — Signed": {
    key: "grievance_acknowledgment",
    disposition: "intake",
    form_template: GRIEVANCE_FORM,
  },
  "Human-Rights Restriction Record": {
    key: "rights_restriction_record",
    disposition: "by_design",
  },
  "Belongings Inventory — Annual": {
    key: "belongings_inventory",
    disposition: "by_design",
  },
  "HHS Room-and-Board Agreement": {
    key: "hhs_room_board_agreement",
    disposition: "intake",
    form_template: ROOM_BOARD_FORM,
  },
  "RHS Lease Agreement": {
    key: "rhs_lease_agreement",
    disposition: "intake",
    form_template: ROOM_BOARD_FORM,
  },
  "PPS Room-and-Board Agreement": {
    key: "pps_room_board_agreement",
    disposition: "intake",
    form_template: ROOM_BOARD_FORM,
  },
  "PBA / Representative-Payee Financial Review": {
    key: "pba_financial_review",
    disposition: "by_design",
  },
  "Emergency Loan Documentation": {
    key: "emergency_loan_record",
    disposition: "by_design",
  },
  "Attendance / Timesheets — Accurate Record": {
    key: "timesheets_attendance",
    disposition: "by_design",
  },
  "Electronic Visit Verification": {
    key: "evv_visit_verification",
    disposition: "by_design",
  },
  "Billed Services Match Service-Code Description": {
    key: "billing_service_match",
    disposition: "by_design",
  },
  "HHS Billable Day — Present plus Daily Note": {
    key: "hhs_billable_day",
    disposition: "by_design",
  },
};

/**
 * App-only leftover title → hive key for Soft's later backfill.
 * Does not apply SQL and does not block Soft. Live titles stay as written;
 * the matcher assigns the catalog key so they are not source=provider.
 *
 * CPR: unsuffixed leftover (ampersand or slash) → Initial. Ampersand
 * Initial/Renewal suffixes follow the matching slash catalog card. If an
 * org has both slash Initial and slash Renewal rows, those exact titles
 * keep their own keys; a leftover combined card still maps to Initial.
 */
export const SOFT_BACKFILL_TITLE_ALIASES: Record<string, string> = {
  "CPR & First Aid Certification": "cpr_first_aid_initial",
  "CPR/First Aid Certification": "cpr_first_aid_initial",
  "CPR & First Aid Certification — Initial": "cpr_first_aid_initial",
  "CPR & First Aid Certification — Renewal": "cpr_first_aid_renewal",
  "Client-Specific Training": "client_specific_training",
};

export function catalogIdentityForTitle(title: string): CatalogIdentity | null {
  return CATALOG_IDENTITY_BY_TITLE[title] ?? null;
}
