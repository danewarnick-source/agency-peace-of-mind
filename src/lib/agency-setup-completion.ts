/**
 * Canonical agency-setup completion — shared by TypeScript and SQL.
 *
 * SQL twin: public.org_setup_is_complete(uuid) in
 * supabase/migrations/20260915080000_agency_setup_questionnaire.sql
 *
 * Required-fact list is REGISTRY-DRIVEN (src/lib/obligations/agency-setup-questions.ts),
 * not a fixed count — the SEI-award-date question is required only when SEI
 * is an awarded code, exactly as AGENCY_SETUP_QUESTIONS' condition says.
 * Same answered semantics on both sides. Never read `specializations` for
 * the gate. Service area is organizations.service_area only:
 *   service_area IS NOT NULL AND length(trim(service_area)) > 0
 */

import {
  AWARDED_SERVICE_CODES_FACT_KEY,
  awardedCodesUnanswered,
} from "./obligations/setup-facts.ts";
import { parseFactAnswer, type FactAnswer, type OrgFacts } from "./obligations/applicability.ts";
import {
  AGENCY_SETUP_QUESTIONS,
  agencySetupQuestionByFactKey,
  requiredAgencySetupQuestions,
  type AgencyAnswerContext,
  type AgencySetupQuestionDefinition,
} from "./obligations/agency-setup-questions.ts";

export const AGENCY_SETUP_COMPLETION_SPEC = {
  version: 2,
  /** Every agency-scope question, regardless of current conditional visibility. */
  questions: AGENCY_SETUP_QUESTIONS,
} as const;

export type AgencySetupFacts = OrgFacts & {
  approxClientCount: number | null;
  serviceArea: string | null;
  dhhsProviderId: string | null;
  seiAwardDate: string | null;
  providesRespiteOvernight: FactAnswer;
  isUsorVendor: FactAnswer;
  supportsSelfAdministeredMedication: FactAnswer;
  actsAsRepresentativePayee: FactAnswer;
  providesTransportation: FactAnswer;
  /** FACT-063 — not baseRequired, so never affects completion; see its question's sourceNote. */
  communityProgramTotalPersonsServed: number | null;
};

export const EMPTY_AGENCY_SETUP_FACTS: AgencySetupFacts = {
  operates_ol_site: null,
  uses_volunteers: null,
  has_governing_board: null,
  servicesOffered: [],
  approxClientCount: null,
  serviceArea: null,
  dhhsProviderId: null,
  seiAwardDate: null,
  providesRespiteOvernight: null,
  isUsorVendor: null,
  supportsSelfAdministeredMedication: null,
  actsAsRepresentativePayee: null,
  providesTransportation: null,
  communityProgramTotalPersonsServed: null,
};

export function parseApproxCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/** Generic "trim, null if blank" parser for a nullable text/date column. */
export function parseNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** @deprecated use parseNullableTrimmedString — kept for existing imports. */
export const parseServiceAreaColumn = parseNullableTrimmedString;

export function agencyAnswerContext(
  facts: Pick<AgencySetupFacts, "servicesOffered">,
): AgencyAnswerContext {
  return {
    awardedCodes: (facts.servicesOffered ?? [])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => c.length > 0),
  };
}

export function setupFactsFromOrgRow(row: {
  fact_operates_ol_site?: unknown;
  fact_uses_volunteers?: unknown;
  fact_has_governing_board?: unknown;
  fact_provides_respite_overnight?: unknown;
  fact_is_usor_vendor?: unknown;
  fact_supports_self_administered_medication?: unknown;
  fact_acts_as_representative_payee?: unknown;
  fact_provides_transportation?: unknown;
  services_offered?: unknown;
  approx_client_count?: unknown;
  service_area?: unknown;
  dhhs_provider_id?: unknown;
  sei_award_date?: unknown;
  fact_community_program_total_persons_served?: unknown;
}): AgencySetupFacts {
  const services = Array.isArray(row.services_offered)
    ? row.services_offered.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    operates_ol_site: parseFactAnswer(row.fact_operates_ol_site),
    uses_volunteers: parseFactAnswer(row.fact_uses_volunteers),
    has_governing_board: parseFactAnswer(row.fact_has_governing_board),
    providesRespiteOvernight: parseFactAnswer(row.fact_provides_respite_overnight),
    isUsorVendor: parseFactAnswer(row.fact_is_usor_vendor),
    supportsSelfAdministeredMedication: parseFactAnswer(
      row.fact_supports_self_administered_medication,
    ),
    actsAsRepresentativePayee: parseFactAnswer(row.fact_acts_as_representative_payee),
    providesTransportation: parseFactAnswer(row.fact_provides_transportation),
    servicesOffered: services,
    approxClientCount: parseApproxCount(row.approx_client_count),
    serviceArea: parseNullableTrimmedString(row.service_area),
    dhhsProviderId: parseNullableTrimmedString(row.dhhs_provider_id),
    seiAwardDate: parseNullableTrimmedString(row.sei_award_date),
    communityProgramTotalPersonsServed: parseApproxCount(
      row.fact_community_program_total_persons_served,
    ),
  };
}

/** Read a question's stored value out of AgencySetupFacts by its factKey. */
export function agencySetupFactValue(factKey: string, facts: AgencySetupFacts): unknown {
  switch (factKey) {
    case AWARDED_SERVICE_CODES_FACT_KEY:
      return facts.servicesOffered;
    case "operates_ol_site":
      return facts.operates_ol_site;
    case "uses_volunteers":
      return facts.uses_volunteers;
    case "has_governing_board":
      return facts.has_governing_board;
    case "approx_client_count":
      return facts.approxClientCount;
    case "service_area":
      return facts.serviceArea;
    case "dhhs_provider_id":
      return facts.dhhsProviderId;
    case "sei_award_date":
      return facts.seiAwardDate;
    case "fact_provides_respite_overnight":
      return facts.providesRespiteOvernight;
    case "fact_is_usor_vendor":
      return facts.isUsorVendor;
    case "fact_supports_self_administered_medication":
      return facts.supportsSelfAdministeredMedication;
    case "fact_acts_as_representative_payee":
      return facts.actsAsRepresentativePayee;
    case "fact_provides_transportation":
      return facts.providesTransportation;
    case "community_program_total_persons_served":
      return facts.communityProgramTotalPersonsServed;
    default:
      return undefined;
  }
}

/**
 * Answered semantics driven by the question's declared answerType — a new
 * question added to AGENCY_SETUP_QUESTIONS is checked correctly with no
 * change needed here.
 */
export function isRequiredSetupFactAnswered(factKey: string, facts: AgencySetupFacts): boolean {
  if (factKey === AWARDED_SERVICE_CODES_FACT_KEY) {
    return !awardedCodesUnanswered(facts.servicesOffered);
  }
  const question = agencySetupQuestionByFactKey(factKey);
  const value = agencySetupFactValue(factKey, facts);
  const answerType = question?.answerType;
  if (answerType === "text" || answerType === "date") {
    return typeof value === "string" && value.trim().length > 0;
  }
  if (answerType === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (answerType === "boolean") {
    return value === true || value === false;
  }
  if (answerType === "multi_select") {
    return Array.isArray(value) && value.length > 0;
  }
  return value !== null && value !== undefined;
}

export function factsAreComplete(facts: AgencySetupFacts): boolean {
  const ctx = agencyAnswerContext(facts);
  return requiredAgencySetupQuestions(ctx).every((q) =>
    isRequiredSetupFactAnswered(q.factKey, facts),
  );
}

export function factAnswerOrNull(value: FactAnswer): FactAnswer {
  return value === true || value === false ? value : null;
}

export type { AgencySetupQuestionDefinition };
