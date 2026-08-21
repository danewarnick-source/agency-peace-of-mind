// DHHS91172 SOW obligation catalog — the auditor's source of truth.
//
// Seeded `company_obligations` rows stay in the database (instances and
// completions key off those ids). This catalog overlays each SOW title with
// the fields a reviewer actually needs and that JSON cadence blobs cannot
// express accurately:
//   - where the work happens (in HIVE vs a state portal vs a standing file)
//   - the real due-date rule (period-following, hire-relative, cert expiration)
//   - who it applies to, and who owns it
//   - what evidence would satisfy a DSPD reviewer
//
// Titles must match the seeded rows exactly. Provider-created obligations
// (source = 'provider') have no catalog entry.

import {
  dueRuleFromConfig,
  explainDueRule,
  type DueRule,
} from "./obligation-due-dates";

export type ObligationCategory =
  | "training"
  | "screening"
  | "licensing"
  | "reporting"
  | "safety"
  | "client_docs"
  | "standing_records"
  | "employment";

export type FulfillmentChannel =
  | "in_hive"
  | "external"
  | "hybrid"
  | "standing";

export type ObligationOwner = "admin" | "manager" | "staff" | "host";

export type SowCatalogEntry = {
  title: string;
  citation: string;
  category: ObligationCategory;
  fulfillment: FulfillmentChannel;
  /** What HIVE can and cannot do for this duty. Shown on the card. */
  fulfillment_note: string;
  due_rule: DueRule;
  owner: ObligationOwner;
  /** Empty = applies regardless of which service codes the org runs. */
  service_codes: string[];
  evidence_standard: string;
  /**
   * When true, a reviewer should not treat a missed calendar instance as a
   * finding by itself — the duty is "keep current" and the instance is a
   * reminder to verify the file.
   */
  calendar_is_reminder_only?: boolean;
};

export const CATEGORY_LABEL: Record<ObligationCategory, string> = {
  training: "Staff training",
  screening: "Screening & credentials",
  licensing: "Licenses & vendor status",
  reporting: "State reporting",
  safety: "Site safety",
  client_docs: "Person-specific documents",
  standing_records: "Standing records",
  employment: "Employment services",
};

export const FULFILLMENT_LABEL: Record<FulfillmentChannel, string> = {
  in_hive: "Tracked in HIVE",
  external: "Filed outside HIVE",
  hybrid: "HIVE + outside filing",
  standing: "Standing record",
};

export const OWNER_LABEL: Record<ObligationOwner, string> = {
  admin: "Admin",
  manager: "Manager",
  staff: "Each assigned staff member",
  host: "Host home",
};

const SOW_ENTRIES: SowCatalogEntry[] = [
  // ── Staff training ──────────────────────────────────────────────────────
  {
    title: "30-Day New Hire Orientation Training",
    citation: "DHHS91172 SOW §1.8(4) / §1.9",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Upload the orientation certificate in HIVE. NECTAR checks that the required topics appear on the document. This is a one-time hire requirement — annual hours are a separate obligation.",
    due_rule: { kind: "days_after_hire", days: 30 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Certificate covering HIPAA, ANE reporting, participant rights, HCBS settings rule, and emergency procedures.",
  },
  {
    title: "Annual 12-Hour Continuing Education",
    citation: "DHHS91172 SOW §1.9",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Upload CE certificates in HIVE. Hours can also be logged in the CE ledger. Due on the hire anniversary starting the year after hire — not a calendar year.",
    due_rule: { kind: "hire_anniversary", start_year: 2 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Documentation of at least 12 DSPD-approved CE hours for the anniversary year.",
  },
  {
    title: "CPR/First Aid Certification — Initial",
    citation: "DHHS91172 SOW §1.8(5)",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Upload the CPR/First Aid card in HIVE. SOW allows 90 days from hire for the initial cert. Renewal is tracked separately off the printed expiration.",
    due_rule: { kind: "days_after_hire", days: 90 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Current CPR and First Aid certification.",
  },
  {
    title: "CPR/First Aid Certification — Renewal",
    citation: "DHHS91172 SOW §1.8(5)",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Upload the renewed card. NECTAR reads the printed expiration and schedules the next due date from that date — not from hire anniversary.",
    due_rule: { kind: "cert_expiration", fallback_months: 24 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Unexpired CPR and First Aid certification.",
  },
  {
    title: "Person-Centered Thinking and Practices Training",
    citation: "DHHS91172 SOW §1.8(5)(C)",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Staff training in person-centered thinking — separate from the Person-Centered Thinking profile completed with each client. Upload the training record in HIVE.",
    due_rule: { kind: "days_after_hire", days: 90 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Proof of person-centered thinking and practices training within 90 days of hire.",
  },
  {
    title: "Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)",
    citation: "DHHS91172 SOW §1.8(6)",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note:
      "Required for staff serving persons likely to engage in aggressive, self-injurious, or destructive behavior. Upload the cert; renewal follows the printed expiration.",
    due_rule: { kind: "cert_expiration", fallback_months: 24 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Current SOAR, MANDT, PART, CPI, Safety Care, or DSPD-approved equivalent.",
  },
  {
    title: "ACRE Training Certification — SEI",
    citation: "DHHS91172 SOW §30.5",
    category: "employment",
    fulfillment: "in_hive",
    fulfillment_note:
      "SEI staff must be ACRE-certified before providing services. Applies only to staff assigned to an SEI client. Upload the ACRE certificate.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["SEI"],
    evidence_standard: "ACRE certificate (USU or accredited ACRE program).",
  },
  {
    title: "ACRE Training Certification — SED",
    citation: "DHHS91172 SOW §28.4",
    category: "employment",
    fulfillment: "in_hive",
    fulfillment_note: "Applies only if the org serves SED. Upload the ACRE certificate.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["SED"],
    evidence_standard: "ACRE certificate.",
  },
  {
    title: "ACRE Training Certification — SJD (60 Days)",
    citation: "DHHS91172 SOW §33.5",
    category: "employment",
    fulfillment: "in_hive",
    fulfillment_note: "SJD staff have 60 days from hire. Applies only to staff assigned to an SJD client.",
    due_rule: { kind: "days_after_hire", days: 60 },
    owner: "staff",
    service_codes: ["SJD"],
    evidence_standard: "ACRE certificate including customized employment.",
  },
  {
    title: "Customized Employment Training (USU) — SEE/SJD",
    citation: "DHHS91172 SOW §29.4 / §33.5",
    category: "employment",
    fulfillment: "in_hive",
    fulfillment_note: "Required before providing SEE or SJD. Upload the USU Customized Employment certificate.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["SEE", "SJD"],
    evidence_standard: "USU Customized Employment training certificate.",
  },
  {
    title: "SEI — SSI/Benefits Knowledge Attestation",
    citation: "DHHS91172 SOW §30.5",
    category: "employment",
    fulfillment: "in_hive",
    fulfillment_note:
      "First-person attestation in HIVE. The knowledge itself is acquired outside HIVE (USOR / benefits training); HIVE records that the staff member attested before serving.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["SEI"],
    evidence_standard: "Staff attestation of basic SSI/Title II/Medicaid earned-income knowledge.",
  },
  {
    title: "HSQ — Clean, Sanitary & Safe Environment Training",
    citation: "DHHS91172 Article 12",
    category: "training",
    fulfillment: "in_hive",
    fulfillment_note: "Applies only to staff assigned to HSQ. Upload training record and attest.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["HSQ"],
    evidence_standard: "Training record on maintaining a clean, sanitary, and safe living environment.",
  },
  {
    title: "DSPD New Caregiver Compensation Training — CMP/CMS",
    citation: "DHHS91172 SOW §32.5",
    category: "training",
    fulfillment: "hybrid",
    fulfillment_note:
      "The course is taken on the DSPD site (80% passing score, effective 7/1/26). Upload the completion record in HIVE so the due date and assignee are tracked.",
    due_rule: { kind: "days_after_hire", days: 0 },
    owner: "staff",
    service_codes: ["CMP", "CMS"],
    evidence_standard: "DSPD New Caregiver Compensation training completion (score ≥ 80%).",
  },

  // ── Screening & credentials ─────────────────────────────────────────────
  {
    title: "Background Screening — Annual",
    citation: "DHHS91172 SOW §1.10",
    category: "screening",
    fulfillment: "hybrid",
    fulfillment_note:
      "The screening itself is done through BCI / the state process. Upload the clearance in HIVE. Due on the hire anniversary; if a later cert prints an expiration, that date wins.",
    due_rule: { kind: "hire_anniversary", start_year: 1 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Current background screening clearance.",
  },
  {
    title: "Medicaid Fraud & Abuse Exclusion Screening — Annual",
    citation: "DHHS91172 SOW §1.11",
    category: "screening",
    fulfillment: "hybrid",
    fulfillment_note:
      "Screen against OIG LEIE / Medicaid exclusion lists outside HIVE, then upload confirmation and attest. Annual from hire date.",
    due_rule: { kind: "hire_anniversary", start_year: 1 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "OIG/Medicaid exclusion screening with no exclusions found.",
  },
  {
    title: "Medicaid Disclosure Form — Annual",
    citation: "DHHS91172 SOW §1.9(6)",
    category: "screening",
    fulfillment: "hybrid",
    fulfillment_note:
      "The form lives on the DSPD webpage. Complete it, then upload the signed copy in HIVE. Due on each hire anniversary.",
    due_rule: { kind: "hire_anniversary", start_year: 1 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Signed DHHS Medicaid Disclosure Form.",
  },
  {
    title: "Educational Credentials and Licenses — On File",
    citation: "DHHS91172 SOW §1.9(4)",
    category: "standing_records",
    fulfillment: "standing",
    fulfillment_note:
      "A standing personnel-file requirement, not a recurring training. Upload transcripts, licenses, or certifications once; the 30-day due date is the onboarding window.",
    due_rule: { kind: "days_after_hire", days: 30 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Copies of applicable transcripts, degrees, licenses, and certifications.",
  },
  {
    title: "Training Documentation File — Maintained",
    citation: "DHHS91172 SOW §1.9(3)",
    category: "standing_records",
    fulfillment: "standing",
    fulfillment_note:
      "Standing record: an external reviewer must be able to verify every required training. HIVE is the file. The generated annual date is a review reminder, not a SOW anniversary.",
    due_rule: { kind: "standing" },
    owner: "admin",
    service_codes: [],
    evidence_standard: "A complete, reviewable training file per staff member.",
    calendar_is_reminder_only: true,
  },
  {
    title: "Driving Record — On File (Transporting Staff)",
    citation: "DHHS91172 SOW §1.30",
    category: "standing_records",
    fulfillment: "standing",
    fulfillment_note:
      "Applies to staff who transport persons. Keep a current driving record, license, and auto insurance on file. Renewed annually from hire.",
    due_rule: { kind: "hire_anniversary", start_year: 1 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Current driving record, valid license, and current auto insurance.",
  },
  {
    title: "Child Placing / Foster Care License (DHHS/OL) — PPS",
    citation: "DHHS91172 SOW §20.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note:
      "Issued by DHHS Office of Licensing. HIVE stores the uploaded license and tracks expiration; the license itself is obtained outside the platform.",
    due_rule: { kind: "cert_expiration", fallback_months: 12 },
    owner: "staff",
    service_codes: ["PPS"],
    evidence_standard: "Current DHHS/OL child-placing or foster-care license.",
  },

  // ── Licenses & vendor status (org) ──────────────────────────────────────
  {
    title: "OL Residential Support License — 4+ Persons per Site",
    citation: "DHHS91172 SOW §21.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note:
      "Office of Licensing issues this. Upload the current license in HIVE. The July 1 date is an annual verification reminder — the real due date is the license expiration.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: ["RHS"],
    evidence_standard: "Current OL Residential Support License per qualifying RHS site.",
    calendar_is_reminder_only: true,
  },
  {
    title: "OL Residential Support Certification — 3 or Fewer Persons per Site",
    citation: "DHHS91172 SOW §21.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note:
      "Office of Licensing issues this. Upload the current certification. July 1 is a verification reminder; track the printed expiration on the document.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: ["RHS"],
    evidence_standard: "Current OL Residential Support Certification per qualifying site.",
    calendar_is_reminder_only: true,
  },
  {
    title: "OL Day Treatment License — 4+ Persons",
    citation: "DHHS91172 SOW §8.5 / §7.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note: "Office of Licensing. Upload the license; July 1 is a verification reminder.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: ["DSG", "DSP", "EPR", "DSI"],
    evidence_standard: "Current OL Day Treatment License.",
    calendar_is_reminder_only: true,
  },
  {
    title: "OL Day Support Certification — 3 or Fewer Persons",
    citation: "DHHS91172 SOW §8.5 / §7.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note: "Office of Licensing. Upload the certification; July 1 is a verification reminder.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: ["DSG", "DSP", "EPR", "DSI"],
    evidence_standard: "Current OL Day Support Certification.",
    calendar_is_reminder_only: true,
  },
  {
    title: "USOR Approved Vendor — Job Coaching (SEI)",
    citation: "DHHS91172 SOW §30.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note:
      "USOR vendor approval happens outside HIVE. Upload the approval letter and attest. This is a one-time (then keep-current) org qualification, not a staff training.",
    due_rule: { kind: "fixed_date", date: "2027-01-31" },
    owner: "admin",
    service_codes: ["SEI"],
    evidence_standard: "USOR approved-vendor letter for job coaching.",
  },
  {
    title: "USOR Approved Vendor — Job Development (SJD)",
    citation: "DHHS91172 SOW §33.5",
    category: "licensing",
    fulfillment: "external",
    fulfillment_note:
      "Proof is submitted to osrprovider@utah.gov. HIVE stores the upload and attestation; it cannot submit to USOR.",
    due_rule: { kind: "days_after_service_start", days: 180 },
    owner: "admin",
    service_codes: ["SJD"],
    evidence_standard: "USOR approved-vendor proof submitted to osrprovider@utah.gov.",
  },
  {
    title: "Zoning / Life Safety Code Compliance Documentation",
    citation: "DHHS91172 SOW §1.11",
    category: "licensing",
    fulfillment: "standing",
    fulfillment_note:
      "Keep current zoning, Life Safety Code, and fire/health documentation for licensed or certified sites. Upload in HIVE. July 1 is an annual verification reminder.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: [],
    evidence_standard: "Current zoning / Life Safety Code / fire-safety documentation.",
    calendar_is_reminder_only: true,
  },

  // ── State reporting (external portals) ──────────────────────────────────
  {
    title: "HHS Annual Outcome Report — Google Form Submission",
    citation: "DHHS91172 SOW §11.7",
    category: "reporting",
    fulfillment: "external",
    fulfillment_note:
      "Submitted via the DSPD Google Form, not HIVE. Attest here after submitting. Due August 30 for the prior year.",
    due_rule: { kind: "calendar_year", month: 8, day: 30 },
    owner: "admin",
    service_codes: ["HHS"],
    evidence_standard: "DSPD Google Form submission (persons served, community-setting %, QI activities).",
  },
  {
    title: "SEI Monthly Summary — UPI Entry Attestation",
    citation: "DHHS91172 SOW §30.3",
    category: "reporting",
    fulfillment: "hybrid",
    fulfillment_note:
      "The summary is written in HIVE, but SEI monthly summaries must be typed into the state's UPI portal by the 15th of the following month. Staff never touch UPI — admin attests here after entry. HIVE cannot transmit to UPI.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["SEI"],
    evidence_standard: "UPI entry for every active SEI client for the service month.",
  },
  {
    title: "SEI Employment Data — UPI Entry Attestation",
    citation: "DHHS91172 SOW §30.3",
    category: "reporting",
    fulfillment: "external",
    fulfillment_note:
      "Employment data is maintained directly in UPI. HIVE only captures the admin attestation that UPI is current.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["SEI"],
    evidence_standard: "Current SEI employment data in UPI.",
  },
  {
    title: "SEI Employment Support Strategies — UPI Entry",
    citation: "DHHS91172 SOW §30.3",
    category: "reporting",
    fulfillment: "external",
    fulfillment_note:
      "Enter updated employment support strategies into UPI within 14 days of a PCSP update. Log the PCSP-update event here to start the clock — HIVE does not watch UPI.",
    due_rule: { kind: "days_after_event", days: 14 },
    owner: "admin",
    service_codes: ["SEI"],
    evidence_standard: "UPI entry of employment support strategies within 2 weeks of the PCSP update.",
  },
  {
    title: "SJD Monthly Summary — UPI Entry Attestation",
    citation: "DHHS91172 SOW §33.3",
    category: "reporting",
    fulfillment: "hybrid",
    fulfillment_note:
      "Summary content can live in HIVE; UPI entry is outside HIVE by the 15th of the following month. Admin attests after entry.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["SJD"],
    evidence_standard: "UPI monthly summary for every active SJD client.",
  },
  {
    title: "SJD Employment Data — UPI Entry Attestation",
    citation: "DHHS91172 SOW §33.3",
    category: "reporting",
    fulfillment: "external",
    fulfillment_note: "Maintained in UPI. HIVE captures the monthly attestation only.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["SJD"],
    evidence_standard: "Current SJD employment data in UPI.",
  },
  {
    title: "SJD Monthly USOR Contact Verification",
    citation: "DHHS91172 SOW §33.3",
    category: "reporting",
    fulfillment: "hybrid",
    fulfillment_note:
      "Verify with each SJD client whether they received USOR outreach this month and record funding status. Attest in HIVE; the contact itself is outside the platform.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["SJD"],
    evidence_standard: "Documented USOR outreach status and funding status per SJD client.",
  },
  {
    title: "CMP/CMS Monthly Summaries — Submitted to SC",
    citation: "DHHS91172 SOW §32.3",
    category: "reporting",
    fulfillment: "hybrid",
    fulfillment_note:
      "Monthly summaries for CMP/CMS are due to the Support Coordinator by the 15th of the following month. Write them in HIVE, then attest that they were sent. HIVE does not email the SC.",
    due_rule: { kind: "calendar_month", due_day: 15, period: "following_month" },
    owner: "admin",
    service_codes: ["CMP", "CMS"],
    evidence_standard: "Monthly summaries completed and submitted to each client's Support Coordinator.",
  },

  // ── Site safety ─────────────────────────────────────────────────────────
  {
    title: "HHS Quarterly Evacuation Drills — All Sites",
    citation: "DHHS91172 SOW §11.3",
    category: "safety",
    fulfillment: "in_hive",
    fulfillment_note:
      "Drills happen at the home. Upload the drill log in HIVE. Due by the last day of the quarter — not the first day of the next quarter.",
    due_rule: { kind: "calendar_quarter_end" },
    owner: "manager",
    service_codes: ["HHS"],
    evidence_standard: "Documented quarterly evacuation drill at each active HHS site.",
  },
  {
    title: "RHS Quarterly Evacuation Drills — All Sites",
    citation: "DHHS91172 SOW §21.3",
    category: "safety",
    fulfillment: "in_hive",
    fulfillment_note: "Upload the drill log. Due by the last day of the quarter.",
    due_rule: { kind: "calendar_quarter_end" },
    owner: "manager",
    service_codes: ["RHS"],
    evidence_standard: "Documented quarterly evacuation drill at each active RHS site.",
  },
  {
    title: "PPS Quarterly Evacuation Drills — All Sites",
    citation: "DHHS91172 SOW §20.3",
    category: "safety",
    fulfillment: "in_hive",
    fulfillment_note: "Upload the drill log. Due by the last day of the quarter.",
    due_rule: { kind: "calendar_quarter_end" },
    owner: "manager",
    service_codes: ["PPS"],
    evidence_standard: "Documented quarterly evacuation drill at each active PPS site.",
  },
  {
    title: "HHS Home Certification — Annual (DSPD Form)",
    citation: "DHHS91172 SOW §11.5",
    category: "safety",
    fulfillment: "hybrid",
    fulfillment_note:
      "Inspect each HHS home using the DSPD Host Home Certification form (outside HIVE), then upload the completed form. This should eventually be one instance per home — today it is tracked org-wide as a single annual packet.",
    due_rule: { kind: "calendar_year", month: 7, day: 1 },
    owner: "admin",
    service_codes: ["HHS"],
    evidence_standard: "Completed DSPD Host Home Certification form per HHS home.",
  },

  // ── Person-specific ─────────────────────────────────────────────────────
  {
    title: "Client-Specific Training — [Client Name]",
    citation: "DHHS91172 SOW §1.8(4)(O)",
    category: "client_docs",
    fulfillment: "in_hive",
    fulfillment_note:
      "One instance per staff+client assignment, due 30 days after assignment. Complete the linked form in HIVE. Support Strategies should be published before this is marked complete.",
    due_rule: { kind: "days_after_assignment", days: 30 },
    owner: "staff",
    service_codes: [],
    evidence_standard: "Person-specific training covering disability/goals, medical/safety, PCSP/BSP/strategies, staff responsibilities, DNR/POLST and hospice if applicable.",
  },
  {
    title: "Support Strategies — [Client Name]",
    citation: "DHHS91172 SOW §1.24(5)",
    category: "client_docs",
    fulfillment: "in_hive",
    fulfillment_note:
      "Develop Support Strategies for each PCSP goal and submit to the Support Coordinator within 30 days of PCSP activation. Log a new event when a PCSP is activated or renewed. BSP / Medical Care Plan substitute for BC and nursing clients.",
    due_rule: { kind: "days_after_event", days: 30 },
    owner: "manager",
    service_codes: [],
    evidence_standard: "Support Strategies submitted to the SC within 30 days of PCSP activation.",
  },
];

const BY_TITLE = new Map(SOW_ENTRIES.map((e) => [e.title, e]));

export function sowCatalogEntry(title: string): SowCatalogEntry | null {
  return BY_TITLE.get(title) ?? null;
}

export function allSowCatalogEntries(): SowCatalogEntry[] {
  return SOW_ENTRIES;
}

export function resolveDueRule(
  title: string,
  cadence: string,
  dueDayConfig: Record<string, unknown> | null | undefined,
): DueRule | null {
  const catalog = BY_TITLE.get(title);
  if (catalog) return catalog.due_rule;
  return dueRuleFromConfig(cadence, dueDayConfig ?? {});
}

export function resolveDueExplanation(
  title: string,
  cadence: string,
  dueDayConfig: Record<string, unknown> | null | undefined,
): string | null {
  const rule = resolveDueRule(title, cadence, dueDayConfig);
  return rule ? explainDueRule(rule) : null;
}
