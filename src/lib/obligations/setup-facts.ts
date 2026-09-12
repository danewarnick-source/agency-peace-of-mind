// Owner-facing setup facts for live catalog paths.
// Concrete operational questions — never "does §X apply?".
// Awarded codes reuse organizations.services_offered. Staff / 1056 facts
// stay on the live records the engine already reads.

import { allSowCatalogEntries } from "../sow-obligation-catalog.ts";
import {
  resolveCatalogExceptions,
  type CatalogExceptions,
} from "./catalog-exceptions.ts";

export const AWARDED_SERVICE_CODES_FACT_KEY = "awarded_service_codes" as const;

/** Same live codes the company profile already records. Not a second catalog. */
export const AWARDED_CODE_CHOICES = ["HHS", "SLN", "SLH", "SEI", "DSI", "RHS"] as const;

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
    dutyKeys: ["usteps_upi_accounts"],
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
