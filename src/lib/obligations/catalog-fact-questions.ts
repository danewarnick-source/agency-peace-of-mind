/**
 * Workbook Applicability_Facts → live questions.
 * Unknown stays unanswered and visible. Never coerce missing facts to N/A.
 * Reuses awarded codes, org profile facts, and staff assignment facts.
 */

import type { ApplicabilityStatus, OrgFacts } from "./applicability.ts";
import { awardedCodeDutyStatus } from "./applicability.ts";
import type { CatalogFact } from "./draft-rules/catalog-loader.ts";
import { awardedCodesUnanswered } from "./setup-facts.ts";

export type CatalogFactLiveSource =
  | "awarded_service_codes"
  | "operates_ol_site"
  | "uses_volunteers"
  | "has_governing_board"
  | "transport_assignment"
  | "abi_caseload"
  | "staff_assignment"
  | "unmapped";

export type CatalogFactQuestion = {
  factId: string;
  question: string;
  source: CatalogFactLiveSource;
  awardedCodes: string[];
  status: ApplicabilityStatus;
  prompt: string;
};

const AWARDED_FACT_CODES: Record<string, string[]> = {
  "FACT-001": ["PPS"],
  "FACT-002": ["SJD"],
  "FACT-004": ["HHS"],
  "FACT-005": ["PBA"],
  "FACT-007": ["RHS"],
  "FACT-008": ["SEI"],
  "FACT-010": ["BC1"],
  "FACT-011": ["BC3"],
  "FACT-012": ["EPR"],
  "FACT-013": ["BC2"],
  "FACT-014": ["PN2"],
  "FACT-015": ["DSG", "DSP"],
  "FACT-019": ["DSI"],
  "FACT-020": ["CMP", "CMS", "SLN"],
  "FACT-023": ["PM1"],
  "FACT-024": ["PM2"],
  "FACT-026": ["ELS"],
  "FACT-027": ["SEE"],
  "FACT-028": ["RP5"],
  "FACT-029": ["RPS"],
  "FACT-030": ["SED"],
  "FACT-031": ["MTP"],
  "FACT-032": ["RP3"],
  "FACT-033": ["RP4"],
  "FACT-034": ["SLH"],
  "FACT-037": ["PN1"],
  "FACT-038": ["RP2"],
  "FACT-039": ["SEC"],
  "FACT-040": ["TFB"],
  "FACT-042": ["PAC"],
  "FACT-045": ["HSQ"],
  "FACT-047": ["COM"],
  "FACT-049": ["SJP"],
  "FACT-050": ["SJR"],
};

const ORG_FACT_IDS: Record<string, CatalogFactLiveSource> = {
  "FACT-006": "operates_ol_site",
  "FACT-035": "uses_volunteers",
  "FACT-057": "has_governing_board",
  "FACT-065": "uses_volunteers",
  "FACT-069": "operates_ol_site",
  "FACT-070": "has_governing_board",
};

const TRANSPORT_FACT_IDS = new Set(["FACT-003", "FACT-080", "FACT-081"]);
const ABI_FACT_IDS = new Set(["FACT-056", "FACT-067", "LIVE-abi_caseload"]);
const STAFF_ASSIGNMENT_FACT_IDS = new Set([
  "FACT-009",
  "FACT-041",
  "FACT-085",
  "LIVE-direct_support_assignment",
  "LIVE-behavior_risk_assignment",
]);

function awardedCodesFromQuestion(question: string): string[] {
  const match = question.match(/agency awarded\s+([a-z0-9,\s/]+)\s*\??/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/[,/]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2,4}\d?$/.test(c));
}

export function liveSourceForCatalogFact(fact: CatalogFact): CatalogFactLiveSource {
  if (fact.fact_id === "LIVE-abi_caseload") return "abi_caseload";
  if (
    fact.fact_id === "LIVE-direct_support_assignment" ||
    fact.fact_id === "LIVE-behavior_risk_assignment"
  ) {
    return "staff_assignment";
  }
  if (AWARDED_FACT_CODES[fact.fact_id] || awardedCodesFromQuestion(fact.question).length > 0) {
    return "awarded_service_codes";
  }
  if (ORG_FACT_IDS[fact.fact_id]) return ORG_FACT_IDS[fact.fact_id];
  if (TRANSPORT_FACT_IDS.has(fact.fact_id)) return "transport_assignment";
  if (ABI_FACT_IDS.has(fact.fact_id)) return "abi_caseload";
  if (STAFF_ASSIGNMENT_FACT_IDS.has(fact.fact_id)) return "staff_assignment";
  return "unmapped";
}

export function evaluateCatalogFact(
  fact: CatalogFact,
  orgFacts: OrgFacts,
  staffKnown?: {
    assignmentsKnown?: boolean;
    transportsPersons?: boolean | null;
    hasAbiCaseload?: boolean | null;
  },
): CatalogFactQuestion {
  const source = liveSourceForCatalogFact(fact);
  const awardedCodes = AWARDED_FACT_CODES[fact.fact_id] ?? awardedCodesFromQuestion(fact.question);
  let status: ApplicabilityStatus = "unanswered";

  if (source === "awarded_service_codes") {
    status = awardedCodeDutyStatus(awardedCodes, orgFacts.servicesOffered);
  } else if (source === "operates_ol_site") {
    status =
      orgFacts.operates_ol_site === null
        ? "unanswered"
        : orgFacts.operates_ol_site
          ? "applies"
          : "does_not_apply";
  } else if (source === "uses_volunteers") {
    status =
      orgFacts.uses_volunteers === null
        ? "unanswered"
        : orgFacts.uses_volunteers
          ? "applies"
          : "does_not_apply";
  } else if (source === "has_governing_board") {
    status =
      orgFacts.has_governing_board === null
        ? "unanswered"
        : orgFacts.has_governing_board
          ? "applies"
          : "does_not_apply";
  } else if (source === "transport_assignment") {
    if (staffKnown?.transportsPersons == null) status = "unanswered";
    else status = staffKnown.transportsPersons ? "applies" : "does_not_apply";
  } else if (source === "abi_caseload") {
    if (staffKnown?.hasAbiCaseload == null) status = "unanswered";
    else status = staffKnown.hasAbiCaseload ? "applies" : "does_not_apply";
  } else if (source === "staff_assignment") {
    status = staffKnown?.assignmentsKnown ? "applies" : "unanswered";
  }

  const prompt =
    status === "unanswered"
      ? fact.question.trim() ||
        "This applicability fact is unanswered. Record it — do not mark N/A."
      : fact.question.trim();

  return {
    factId: fact.fact_id,
    question: fact.question,
    source,
    awardedCodes,
    status,
    prompt,
  };
}

export function unansweredCatalogFactQuestions(
  facts: readonly CatalogFact[],
  orgFacts: OrgFacts,
): CatalogFactQuestion[] {
  return facts
    .map((fact) => evaluateCatalogFact(fact, orgFacts))
    .filter((row) => row.status === "unanswered");
}

/**
 * Owner-facing prompts for unanswered catalog facts. Awarded-code facts
 * collapse to the existing company-profile question when codes are empty.
 */
export function catalogFactPrompts(facts: readonly CatalogFact[], orgFacts: OrgFacts): string[] {
  const unanswered = unansweredCatalogFactQuestions(facts, orgFacts);
  const prompts: string[] = [];
  const awardedOpen = unanswered.some((row) => row.source === "awarded_service_codes");
  if (awardedOpen && awardedCodesUnanswered(orgFacts.servicesOffered)) {
    prompts.push("Which DSPD service codes is this contractor awarded?");
  }
  for (const row of unanswered) {
    if (row.source === "awarded_service_codes") continue;
    prompts.push(row.prompt);
  }
  return [...new Set(prompts)];
}
