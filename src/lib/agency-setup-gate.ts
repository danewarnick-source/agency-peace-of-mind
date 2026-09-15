/**
 * Agency setup gate — server-authoritative completion from saved facts.
 * Staff and client creation stay closed until every applicable required
 * operating question has a recorded answer. Which questions are required is
 * registry-driven (src/lib/obligations/agency-setup-questions.ts) and reacts
 * to awarded codes (e.g. the SEI award-date question is only required once
 * SEI is awarded). Banner math is display-only.
 */

import {
  computeObligationApplicability,
  type ObligationApplicability,
  type OrgFacts,
} from "./obligations/applicability.ts";
import {
  CORE_RULE_LOGIC_SLICE,
  canActivate,
  simulateDraftRules,
  type SimulationResult,
  type SyntheticStaff,
} from "./obligations/draft-rules/index.ts";
import {
  AGENCY_SETUP_QUESTIONS,
  requiredAgencySetupQuestions,
  type AgencyAnswerContext,
} from "./obligations/agency-setup-questions.ts";
import {
  AGENCY_SETUP_COMPLETION_SPEC,
  agencyAnswerContext,
  factsAreComplete,
  isRequiredSetupFactAnswered,
  type AgencySetupFacts,
} from "./agency-setup-completion.ts";

export {
  AGENCY_SETUP_COMPLETION_SPEC,
  EMPTY_AGENCY_SETUP_FACTS,
  agencyAnswerContext,
  agencySetupFactValue,
  factAnswerOrNull,
  isRequiredSetupFactAnswered,
  parseApproxCount,
  parseNullableTrimmedString,
  parseServiceAreaColumn,
  setupFactsFromOrgRow,
  type AgencySetupFacts,
} from "./agency-setup-completion.ts";
export {
  AGENCY_SETUP_QUESTIONS,
  AGENCY_SETUP_QUESTIONS_VERSION,
  AGENCY_SETUP_SECTIONS,
  AGENCY_SETUP_SECTION_LABELS,
  NON_QUESTION_FACT_DISPOSITIONS,
  SECTION_CODE_CALLOUTS,
  activeSectionCodeCallouts,
  agencySetupQuestionByFactKey,
  agencySetupQuestionsBySection,
  isQuestionRequired,
  isQuestionVisible,
  isSectionVisible,
  requiredAgencySetupQuestions,
  visibleAgencySetupQuestions,
  type AgencyAnswerContext,
  type AgencySetupQuestionDefinition,
  type AgencySetupSection,
} from "./obligations/agency-setup-questions.ts";
export { DEFERRED_FACTS } from "./obligations/deferred-setup-facts.ts";

export const AGENCY_SETUP_PATH = "/dashboard/settings/compliance-setup" as const;

export const AGENCY_SETUP_INCOMPLETE_MESSAGE =
  "Agency setup is incomplete. Answer the required operating questions before creating staff or clients.";

export type RequiredSetupQuestion = {
  key: string;
  question: string;
  help: string;
};

/** Every agency question that exists, independent of current conditional visibility. */
export const REQUIRED_SETUP_QUESTIONS: RequiredSetupQuestion[] = AGENCY_SETUP_QUESTIONS.map(
  (q) => ({
    key: q.factKey,
    question: q.question,
    help: q.help ?? "",
  }),
);

export type AgencySetupStatus = {
  complete: boolean;
  answeredCount: number;
  requiredCount: number;
  unanswered: RequiredSetupQuestion[];
  answeredKeys: string[];
  progressLabel: string;
  message: string | null;
  /** One-time SQL snapshot: org already had staff/clients when the gate landed. */
  createGateExempt: boolean;
  /** complete OR createGateExempt — the create/invite/redirect authority. */
  createAllowed: boolean;
};

export type ComputeAgencySetupStatusOptions = {
  createGateExempt?: boolean;
};

export const SETUP_GATED_PATHS = [
  "/dashboard/employees",
  "/dashboard/employees/new",
  "/dashboard/hub/employees",
  "/dashboard/clients",
  "/dashboard/clients/new",
  "/dashboard/hub/clients",
  "/employees/new",
  "/employees",
  "/clients/new",
  "/clients",
] as const;

export const SETUP_CREATE_APIS = [
  "createEmployeeManually",
  "hireEmployeeInternal",
  "applyEmployeeRosterRow",
  "createInvitation",
  "clients.insert",
  "smartImportCommitClient",
  "smartImportCommitStaff",
] as const;

export function computeAgencySetupStatus(
  facts: AgencySetupFacts,
  options: ComputeAgencySetupStatusOptions = {},
): AgencySetupStatus {
  const ctx: AgencyAnswerContext = agencyAnswerContext(facts);
  const required = requiredAgencySetupQuestions(ctx);
  const unanswered = required
    .filter((q) => !isRequiredSetupFactAnswered(q.factKey, facts))
    .map((q) => ({ key: q.factKey, question: q.question, help: q.help ?? "" }));
  const answeredKeys = required
    .filter((q) => isRequiredSetupFactAnswered(q.factKey, facts))
    .map((q) => q.factKey);
  const answeredCount = answeredKeys.length;
  const requiredCount = required.length;
  const complete = unanswered.length === 0 && factsAreComplete(facts);
  const createGateExempt = options.createGateExempt === true;
  return {
    complete,
    answeredCount,
    requiredCount,
    unanswered,
    answeredKeys,
    progressLabel: `${answeredCount} of ${requiredCount}`,
    message: complete ? null : AGENCY_SETUP_INCOMPLETE_MESSAGE,
    createGateExempt,
    createAllowed: complete || createGateExempt,
  };
}

export function canSkipAgencySetup(status: AgencySetupStatus): boolean {
  return status.complete;
}

export function shouldBlockStaffClientCreate(status: AgencySetupStatus): boolean {
  return !status.createAllowed;
}

export function assertAgencySetupComplete(status: AgencySetupStatus): void {
  if (!status.createAllowed) {
    throw new Error(AGENCY_SETUP_INCOMPLETE_MESSAGE);
  }
}

export function isSetupGatedPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return SETUP_GATED_PATHS.some((gated) => path === gated || path.startsWith(`${gated}/`));
}

export function isDashboardHomePath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return path === "/dashboard";
}

export function setupRedirectForPath(
  pathname: string,
  status: AgencySetupStatus,
): { to: typeof AGENCY_SETUP_PATH; search: { reason: string } } | null {
  if (status.createAllowed) return null;
  if (!isSetupGatedPath(pathname)) return null;
  return {
    to: AGENCY_SETUP_PATH,
    search: { reason: "setup_incomplete" },
  };
}

export type OrgAccessActor = {
  userId: string;
  organizationId: string;
  role?: string | null;
};

export function canAccessOrgResource(input: {
  actor: OrgAccessActor | null | undefined;
  resourceOrganizationId: string;
}): boolean {
  if (!input.actor?.userId || !input.actor.organizationId) return false;
  return input.actor.organizationId === input.resourceOrganizationId;
}

export function canViewAgencySetup(input: {
  actor: OrgAccessActor | null | undefined;
  organizationId: string;
}): boolean {
  return canAccessOrgResource({ actor: input.actor, resourceOrganizationId: input.organizationId });
}

export function canModifyAgencySetup(input: {
  actor: OrgAccessActor | null | undefined;
  organizationId: string;
}): boolean {
  if (!canViewAgencySetup(input)) return false;
  const role = input.actor?.role ?? "";
  return role === "admin" || role === "program_manager" || role === "manager";
}

export function isolateOrgRecords<T extends { organizationId: string }>(
  actor: OrgAccessActor | null | undefined,
  rows: T[],
): T[] {
  if (!actor?.organizationId) return [];
  return rows.filter((row) => row.organizationId === actor.organizationId);
}

export type AgencyRequirementSnapshot = {
  organizationId: string;
  applicability: ObligationApplicability[];
  draft: SimulationResult;
  activatedRules: boolean;
  canActivateAny: boolean;
};

export function reevaluateAgencyRequirements(input: {
  organizationId: string;
  facts: AgencySetupFacts;
  staff?: SyntheticStaff[];
  now?: Date;
}): AgencyRequirementSnapshot {
  const applicability = computeObligationApplicability(input.facts);
  const draft = simulateDraftRules({
    rules: CORE_RULE_LOGIC_SLICE,
    orgFacts: input.facts,
    staff: input.staff ?? [],
    evidence: [],
    now: input.now ?? new Date("2026-09-14T12:00:00.000Z"),
    orgHasAcreCoverage: null,
    organizationId: input.organizationId,
  });
  const canActivateAny = CORE_RULE_LOGIC_SLICE.some((rule) => canActivate(rule));
  return {
    organizationId: input.organizationId,
    applicability,
    draft,
    activatedRules: draft.activatedRules,
    canActivateAny,
  };
}

export function orgFactsFromSetup(facts: AgencySetupFacts): OrgFacts {
  return {
    operates_ol_site: facts.operates_ol_site,
    uses_volunteers: facts.uses_volunteers,
    has_governing_board: facts.has_governing_board,
    servicesOffered: facts.servicesOffered,
  };
}
