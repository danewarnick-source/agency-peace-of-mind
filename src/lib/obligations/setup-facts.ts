// Owner-facing setup facts for live catalog paths.
// Concrete operational questions — never "does §X apply?".
// Awarded codes reuse organizations.services_offered. Staff / 1056 facts
// stay on the live records the engine already reads.

import { allSowCatalogEntries } from "../sow-obligation-catalog.ts";
import { resolveCatalogExceptions, type CatalogExceptions } from "./catalog-exceptions.ts";
import { awardableServiceCodeChoices } from "../service-code-registry.ts";

export const AWARDED_SERVICE_CODES_FACT_KEY = "awarded_service_codes" as const;

/**
 * Every SOW service code an agency can be awarded — sourced from
 * src/lib/service-code-registry.ts, the one authoritative code list. Do not
 * hand-roll a narrower list anywhere else; every surface that lets an owner
 * pick awarded codes (compliance setup, company profile) must import this.
 */
export const AWARDED_CODE_CHOICES: readonly string[] = awardableServiceCodeChoices();

export type SetupFactSource =
  | "org_profile"
  | "awarded_codes"
  | "staff_assignment"
  | "abi_caseload"
  | "transport_assignment"
  | "authorization_1056";

export type LivePathId =
  | "orientation"
  | "cpr"
  | "abi"
  | "transport"
  | "client_specific"
  | "acre_sei"
  | "acre_sed"
  | "acre_sjd"
  | "sjd_discovery"
  | "usor_sei"
  | "sei_monthly"
  | "sjd_monthly"
  | "cmp_cms_monthly"
  | "service_notes"
  | "evv"
  | "hhs_daily"
  | "cmp_cms"
  | "designated_benefits"
  | "code_of_conduct"
  | "org_profile"
  | "awarded_codes"
  | "billing_1056";

export type LivePathSetupQuestion = {
  path: LivePathId;
  dutyKeys: string[];
  question: string;
  help: string;
  source: SetupFactSource;
  factKey: string;
  /** Owner records this on compliance setup / company profile. */
  ownerAnswers: boolean;
};

export const AWARDED_CODES_QUESTION: LivePathSetupQuestion = {
  path: "awarded_codes",
  dutyKeys: [],
  question: "Which DSPD service codes is this contractor awarded?",
  help: "Record the codes on the company profile. Empty is unanswered — code-gated duties stay visible until this is recorded. Not a yes/no on a SOW article.",
  source: "awarded_codes",
  factKey: AWARDED_SERVICE_CODES_FACT_KEY,
  ownerAnswers: true,
};

export const LIVE_PATH_SETUP_QUESTIONS: LivePathSetupQuestion[] = [
  {
    path: "orientation",
    dutyKeys: ["orientation_30_day"],
    question: "Which staff have a direct-support assignment?",
    help: "30-day orientation follows a client assignment, not a job title. Unknown assignment stays unanswered.",
    source: "staff_assignment",
    factKey: "direct_support_assignment",
    ownerAnswers: false,
  },
  {
    path: "cpr",
    dutyKeys: ["cpr_first_aid_initial", "cpr_first_aid_renewal"],
    question: "Which staff have a direct-support assignment?",
    help: "CPR / First Aid follows the same assignment fact as orientation. Unknown stays unanswered.",
    source: "staff_assignment",
    factKey: "direct_support_assignment",
    ownerAnswers: false,
  },
  {
    path: "abi",
    dutyKeys: ["abi_training"],
    question: "Which persons have acquired brain injury, and which staff serve them?",
    help: "Read from the person record and the staff ABI flag. Not a question about whether ABI training applies.",
    source: "abi_caseload",
    factKey: "abi_caseload",
    ownerAnswers: false,
  },
  {
    path: "transport",
    dutyKeys: ["driving_record_transport"],
    question: "Which staff transport persons?",
    help: "Read from the transport assignment. Not a question about whether a driving-record duty applies.",
    source: "transport_assignment",
    factKey: "transport_assignment",
    ownerAnswers: false,
  },
  {
    path: "client_specific",
    dutyKeys: ["client_specific_training"],
    question: "Which staff are assigned to which persons?",
    help: "Client-specific training opens from the staff+person assignment. Missing assignment is a gap, not N/A.",
    source: "staff_assignment",
    factKey: "staff_client_assignment",
    ownerAnswers: false,
  },
  {
    path: "acre_sei",
    dutyKeys: ["acre_sei"],
    question: "Which staff are assigned to an SEI authorization?",
    help: "ACRE follows the SEI assignment code. There is no SEI fact_key and no 'does SEI apply?' question.",
    source: "staff_assignment",
    factKey: "sei_assignment",
    ownerAnswers: false,
  },
  {
    path: "acre_sed",
    dutyKeys: ["acre_sed"],
    question: "Which staff are assigned to an SED authorization?",
    help: "ACRE-SED follows the SED assignment code. Unknown assignment stays unanswered.",
    source: "staff_assignment",
    factKey: "sed_assignment",
    ownerAnswers: false,
  },
  {
    path: "acre_sjd",
    dutyKeys: ["acre_sjd"],
    question: "Which staff are assigned to an SJD authorization?",
    help: "SJD ACRE (60 days, supervised while pending) follows the SJD assignment. Unknown assignment stays unanswered.",
    source: "staff_assignment",
    factKey: "sjd_assignment",
    ownerAnswers: false,
  },
  {
    path: "sjd_discovery",
    dutyKeys: ["customized_employment_usu"],
    question: "Which SJD staff perform Discovery?",
    help: "Customized Employment applies only when the staff performs Discovery. Do not copy SEI named-course alternatives onto SJD. Unknown Discovery stays unanswered.",
    source: "staff_assignment",
    factKey: "sjd_discovery",
    ownerAnswers: false,
  },
  {
    path: "usor_sei",
    dutyKeys: ["usor_job_coaching_sei"],
    question: "When was this contractor awarded SEI?",
    help: "USOR job-coaching vendor proof follows the SEI award date. Existing awards before 2026-07-01 use 2027-01-31; later awards use award plus six months. Empty award date stays unanswered. Do not invent a destination email.",
    source: "awarded_codes",
    factKey: "sei_award_date",
    ownerAnswers: true,
  },
  {
    path: "sei_monthly",
    dutyKeys: ["sei_monthly_summary_upi"],
    question: "Which persons have an active SEI authorization this month?",
    help: "SEI monthly summaries are typed into UPI by the 15th of the following month. Staff never touch UPI — admin attests after entry. Empty caseload stays unanswered.",
    source: "authorization_1056",
    factKey: "sei_monthly_caseload",
    ownerAnswers: false,
  },
  {
    path: "sjd_monthly",
    dutyKeys: ["sjd_monthly_summary_upi"],
    question: "Which persons have an active SJD authorization this month?",
    help: "SJD monthly summaries are typed into UPI by the 15th of the following month. Staff never touch UPI — admin attests after entry. Empty caseload stays unanswered.",
    source: "authorization_1056",
    factKey: "sjd_monthly_caseload",
    ownerAnswers: false,
  },
  {
    path: "cmp_cms_monthly",
    dutyKeys: ["cmp_cms_monthly_summaries"],
    question: "Which persons have an active CMP or CMS authorization this month?",
    help: "CMP/CMS monthly summaries go to the Support Coordinator by the 15th of the following month. Not UPI. SLN stays quarterly. HIVE does not email the SC.",
    source: "authorization_1056",
    factKey: "cmp_cms_monthly_caseload",
    ownerAnswers: false,
  },
  {
    path: "service_notes",
    dutyKeys: ["timesheets_attendance"],
    question: "Which persons received a documented service?",
    help: "Service notes, timesheets, and signatures follow the service record. Completing the note does not satisfy EVV, payroll, or signature. Unknown assignment stays unanswered.",
    source: "staff_assignment",
    factKey: "service_documentation_assignment",
    ownerAnswers: false,
  },
  {
    path: "evv",
    dutyKeys: ["evv_visit_verification"],
    question: "Which staff are assigned an EVV-mandated service code?",
    help: "EVV applies only to mandated codes in evv-codes.ts. HHS, DSI, and SEI are not EVV-mandated. A note never absorbs this lane. Unknown assignment stays unanswered.",
    source: "staff_assignment",
    factKey: "evv_assignment",
    ownerAnswers: false,
  },
  {
    path: "hhs_daily",
    dutyKeys: ["hhs_billable_day"],
    question: "Which persons have an HHS authorization and an overnight stay?",
    help: "HHS billable day is attendance Present plus the host-home daily note and overnight confirmation. The general five-field punch note does not substitute. Empty caseload stays unanswered.",
    source: "authorization_1056",
    factKey: "hhs_daily_caseload",
    ownerAnswers: false,
  },
  {
    path: "cmp_cms",
    dutyKeys: ["cmp_cms_caregiver_comp"],
    question: "Which staff are assigned CMP or CMS?",
    help: "Official DSPD caregiver-compensation training follows CMP/CMS assignment, not SLN alone.",
    source: "staff_assignment",
    factKey: "cmp_cms_assignment",
    ownerAnswers: false,
  },
  {
    path: "designated_benefits",
    dutyKeys: ["sei_ssi_benefits"],
    question:
      "Which staff is designated as the qualified SSI / Title II / Medicaid earned-income person?",
    help: "SEI benefits knowledge is a designated-person count, not every SEI or office staff member. Unknown designation stays unanswered.",
    source: "staff_assignment",
    factKey: "designated_benefits_staff",
    ownerAnswers: false,
  },
  {
    path: "code_of_conduct",
    dutyKeys: ["dhhs_code_of_conduct_signed"],
    question: "Which staff are assigned to SLN, SLH, HHS, or PPS?",
    help: "Code of Conduct follows those assignment codes, not a staff type.",
    source: "staff_assignment",
    factKey: "residential_assignment",
    ownerAnswers: false,
  },
  {
    path: "org_profile",
    dutyKeys: ["zoning_life_safety", "volunteer_training_file", "governing_board_records"],
    question:
      "Does this contractor operate an OL-licensed site, use regularly scheduled volunteers, or have a governing board?",
    help: "Three recorded operational facts. Leave unanswered until known — never mark N/A to hide the duty.",
    source: "org_profile",
    factKey: "org_profile_facts",
    ownerAnswers: true,
  },
  AWARDED_CODES_QUESTION,
  {
    path: "billing_1056",
    dutyKeys: [
      "usteps_upi_accounts",
      "upi_form_0_9_designee",
      "upi_form_0_8_user",
      "upi_need_to_know_access",
      "upi_1056_decision",
      "upi_1056_reject_coordinate",
      "upi_1056_utilization",
      "upi_provider_organization",
      "upi_staff_org_groups",
      "upi_staff_notify_prefs",
      "upi_person_org_groups",
      "upi_remove_terminated_staff",
      "upi_remove_staff_need_to_know",
      "upi_remove_discharged_person",
      "upi_annual_access_review",
      "upi_notify_usteps_termination",
    ],
    question: "Which persons have an active 1056 authorization for each awarded code?",
    help: "Read from client billing authorizations. Missing 1056 holds billing. SOW CSV import of extra codes is still deferred.",
    source: "authorization_1056",
    factKey: "authorization_1056",
    ownerAnswers: false,
  },
];

export function setupQuestionAsksWhetherSectionApplies(question: string): boolean {
  return /does\s*§|does this (duty|obligation|section|clause|article) apply/i.test(question);
}

export function livePathQuestionByDutyKey(dutyKey: string): LivePathSetupQuestion | null {
  return LIVE_PATH_SETUP_QUESTIONS.find((q) => q.dutyKeys.includes(dutyKey)) ?? null;
}

export function exceptionsForLivePath(path: LivePathSetupQuestion): CatalogExceptions[] {
  return path.dutyKeys.map((key) => resolveCatalogExceptions(key));
}

export function awardedCodesUnanswered(servicesOffered: string[] | null | undefined): boolean {
  return (servicesOffered ?? []).filter((c) => c.trim().length > 0).length === 0;
}

/** Agency / host catalog rows gated by awarded codes — not staff assignment duties. */
export function agencyServiceCodeCatalogKeys(): string[] {
  return allSowCatalogEntries()
    .filter(
      (entry) =>
        entry.disposition !== "retired" &&
        entry.owner !== "staff" &&
        entry.service_codes.length > 0,
    )
    .map((entry) => entry.key);
}
