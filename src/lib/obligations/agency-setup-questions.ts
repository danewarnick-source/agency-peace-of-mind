/**
 * Agency-level provider-setup question registry.
 *
 * Source of truth: docs/compliance/dhhs91172/Applicability_Facts.json (the
 * "workbook" — 85 rows, fact_id FACT-001..FACT-085). Every workbook fact_id
 * is accounted for below as exactly one of:
 *   - a live AGENCY_SETUP_QUESTIONS entry (owner answers it during setup)
 *   - merged into another AGENCY_SETUP_QUESTIONS entry (see its sourceFactIds)
 *   - a DEFERRED_FACTS entry (belongs to a staff/client/location/assignment
 *     record that cannot exist yet at agency-setup time — see
 *     src/lib/obligations/deferred-setup-facts.ts)
 *   - a NON_QUESTION_FACT_DISPOSITIONS entry (derived from other data, or a
 *     static rule that was never an owner-facing question)
 * agency-setup-questions.coverage.test.ts asserts this partition is total and
 * exhaustive against the live workbook file — it fails loudly if a fact_id
 * is missing or double-counted, and if any sourceFactIds/sourceNote
 * references an id the workbook does not contain.
 *
 * This module intentionally does NOT touch src/lib/obligations/applicability.ts's
 * `OrgFacts` type (draft-rules/simulation.ts consumes that as an exact,
 * closed type across dozens of fixtures) and does not gate, activate, or
 * publish any DHHS91172 catalog rule — it only collects and stores facts.
 */
import applicabilityFactsJson from "../../../docs/compliance/dhhs91172/Applicability_Facts.json" with { type: "json" };
import { awardableServiceCodeChoices } from "../service-code-registry.ts";
import { AWARDED_SERVICE_CODES_FACT_KEY } from "./setup-facts.ts";

export const AGENCY_SETUP_QUESTIONS_VERSION = 2;

export type QuestionScope = "agency" | "location" | "staff" | "client" | "assignment";
export type AnswerType = "boolean" | "multi_select" | "single_select" | "number" | "text" | "date";

/** Status is stored separately from value. "No" and 0 are answers, not gaps. */
export const ANSWER_STATUSES = ["unanswered", "answered", "unknown", "not_applicable"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const AGENCY_SETUP_SECTIONS = [
  "services_and_award",
  "locations_and_licensing",
  "residential_and_host_home",
  "transportation",
  "workforce_and_governance",
  "clinical_and_behavior_support",
  "employment_services",
  "client_funds",
] as const;
export type AgencySetupSection = (typeof AGENCY_SETUP_SECTIONS)[number];

export const AGENCY_SETUP_SECTION_LABELS: Record<AgencySetupSection, string> = {
  services_and_award: "Services & contract",
  locations_and_licensing: "Locations & licensing",
  residential_and_host_home: "Residential & host-home operations",
  transportation: "Transportation",
  workforce_and_governance: "Workforce & governance",
  clinical_and_behavior_support: "Clinical & behavior support",
  employment_services: "Employment services",
  client_funds: "Client funds & representative payee",
};

export type AgencyAnswerContext = {
  /** Normalized upper-case codes from organizations.services_offered. */
  awardedCodes: string[];
};

export type SetupQuestionCondition = {
  /** Plain description for the coverage table / audits. */
  description: string;
  visible: (ctx: AgencyAnswerContext) => boolean;
  /** Defaults to `visible` when omitted — visible and not-required is rare but allowed. */
  required?: (ctx: AgencyAnswerContext) => boolean;
};

export type SetupQuestionStorage =
  | { kind: "column"; table: "organizations"; column: string; isNewColumn?: boolean }
  | { kind: "derived"; description: string }
  | { kind: "rule"; description: string };

export type AgencySetupQuestionDefinition = {
  id: string;
  factKey: string;
  introducedInVersion: number;
  scope: "agency";
  section: AgencySetupSection;
  question: string;
  help?: string;
  whyItMatters?: string;
  answerType: AnswerType;
  options?: ReadonlyArray<{ value: string; label: string }>;
  baseRequired: boolean;
  condition?: SetupQuestionCondition;
  storage: SetupQuestionStorage;
  sourceFactIds: readonly string[];
  sourceRequirementIds: readonly string[];
  /** Other factKeys whose visibility/requiredness reacts to this answer. */
  affects?: readonly string[];
  sourceNote?: string;
};

// ---------------------------------------------------------------------------
// Workbook lookup — every sourceFactIds reference below is validated against
// this at build time (throws immediately on a typo'd or retired fact_id).
// ---------------------------------------------------------------------------

type RawFact = {
  fact_scope: string;
  question: string;
  answer_type: string;
  fact_id: string;
  linked_requirement_keys: string;
};

const RAW_FACTS: RawFact[] = (applicabilityFactsJson as { rows: RawFact[] }).rows;
const RAW_FACT_BY_ID = new Map(RAW_FACTS.map((f) => [f.fact_id, f]));

export function workbookFactIds(): string[] {
  return RAW_FACTS.map((f) => f.fact_id);
}

export function workbookFact(factId: string): RawFact | null {
  return RAW_FACT_BY_ID.get(factId) ?? null;
}

function reqIdsFor(...factIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of factIds) {
    const raw = RAW_FACT_BY_ID.get(id);
    if (!raw) throw new Error(`agency-setup-questions: unknown workbook fact_id "${id}"`);
    for (const req of raw.linked_requirement_keys.split(",")) {
      const trimmed = req.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const ALWAYS: SetupQuestionCondition["visible"] = () => true;

function awardedAny(...codes: string[]): SetupQuestionCondition["visible"] {
  const set = new Set(codes.map((c) => c.toUpperCase()));
  return (ctx) => ctx.awardedCodes.some((c) => set.has(c));
}

/** Awarded-code sets that back the conditional sections (also used by the wizard UI). */
export const RESIDENTIAL_HOST_HOME_CODES = ["HHS", "RHS", "PPS", "SLH", "SLN"] as const;
export const EMPLOYMENT_SERVICE_CODES = [
  "SEI",
  "SJD",
  "SEC",
  "SEE",
  "SJP",
  "SJR",
  "EPR",
  "BC1",
  "BC2",
  "BC3",
] as const;

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const AGENCY_SETUP_QUESTIONS: readonly AgencySetupQuestionDefinition[] = [
  {
    id: "q_awarded_service_codes",
    factKey: AWARDED_SERVICE_CODES_FACT_KEY,
    introducedInVersion: 1,
    scope: "agency",
    section: "services_and_award",
    question: "Which DSPD service codes is this contractor currently awarded to provide?",
    help:
      "Select every code on your DHHS91172 award — not just the ones you plan to bill first. " +
      'Leave empty until you know for certain: empty is unanswered, not "none." A code your ' +
      "agency already had on file that isn't in this list stays selected and is flagged for " +
      "verification rather than removed.",
    whyItMatters:
      "Almost every other question and every compliance requirement on the platform is gated by " +
      "which codes you run.",
    answerType: "multi_select",
    options: awardableServiceCodeChoices().map((code) => ({ value: code, label: code })),
    baseRequired: true,
    storage: { kind: "column", table: "organizations", column: "services_offered" },
    sourceFactIds: [
      "FACT-001",
      "FACT-002",
      "FACT-004",
      "FACT-005",
      "FACT-007",
      "FACT-008",
      "FACT-010",
      "FACT-011",
      "FACT-012",
      "FACT-013",
      "FACT-014",
      "FACT-015",
      "FACT-019",
      "FACT-020",
      "FACT-023",
      "FACT-024",
      "FACT-026",
      "FACT-027",
      "FACT-028",
      "FACT-029",
      "FACT-030",
      "FACT-031",
      "FACT-032",
      "FACT-033",
      "FACT-034",
      "FACT-037",
      "FACT-038",
      "FACT-039",
      "FACT-040",
      "FACT-042",
      "FACT-045",
      "FACT-047",
      "FACT-049",
      "FACT-050",
    ],
    sourceRequirementIds: reqIdsFor(
      "FACT-001",
      "FACT-002",
      "FACT-004",
      "FACT-005",
      "FACT-007",
      "FACT-008",
      "FACT-010",
      "FACT-011",
      "FACT-012",
      "FACT-013",
      "FACT-014",
      "FACT-015",
      "FACT-019",
      "FACT-020",
      "FACT-023",
      "FACT-024",
      "FACT-026",
      "FACT-027",
      "FACT-028",
      "FACT-029",
      "FACT-030",
      "FACT-031",
      "FACT-032",
      "FACT-033",
      "FACT-034",
      "FACT-037",
      "FACT-038",
      "FACT-039",
      "FACT-040",
      "FACT-042",
      "FACT-045",
      "FACT-047",
      "FACT-049",
      "FACT-050",
    ),
    affects: ["sei_award_date"],
    sourceNote:
      'One multi-select replaces 34 near-identical "agency awarded CODE X?" workbook rows — ' +
      "each row's REQs are unioned into sourceRequirementIds above.",
  },
  {
    id: "q_sei_award_date",
    factKey: "sei_award_date",
    introducedInVersion: 2,
    scope: "agency",
    section: "services_and_award",
    question: "When was this contractor awarded SEI (Supported Employment for an Individual)?",
    help:
      "This date drives the USOR job-coaching vendor proof deadline: awards before 2026-07-01 use " +
      "2027-01-31; later awards use award date plus six months.",
    answerType: "date",
    baseRequired: true,
    condition: {
      description: "Visible and required only when SEI is an awarded code.",
      visible: awardedAny("SEI"),
    },
    storage: {
      kind: "column",
      table: "organizations",
      column: "sei_award_date",
      isNewColumn: true,
    },
    sourceFactIds: [],
    sourceRequirementIds: [],
    sourceNote:
      "Not a workbook row — this is the pre-existing internal engine fact LIVE-sei_award_date " +
      "(src/lib/obligations/third-executable-batch.ts), previously ownerAnswers:true in " +
      "setup-facts.ts's usor_sei live path with no real input control anywhere. This question " +
      "fixes that placeholder.",
  },
  {
    id: "q_dhhs_provider_id",
    factKey: "dhhs_provider_id",
    introducedInVersion: 2,
    scope: "agency",
    section: "services_and_award",
    question: "What is this contractor's Medicaid / DHHS provider ID?",
    help:
      "If you hold separate IDs per waiver (Community Support, Community Transition, ABI), list " +
      "them all. If it's still pending with the state, mark this \"I don't know yet\" rather than " +
      "guessing — Utah EVV export already reads this field.",
    answerType: "text",
    baseRequired: true,
    storage: { kind: "column", table: "organizations", column: "dhhs_provider_id" },
    sourceFactIds: ["FACT-064"],
    sourceRequirementIds: reqIdsFor("FACT-064"),
    sourceNote:
      "Reuses the existing organizations.dhhs_provider_id column (already used by EVV export) — no new column.",
  },
  {
    id: "q_community_program_total_persons_served",
    factKey: "community_program_total_persons_served",
    introducedInVersion: 2,
    scope: "agency",
    section: "residential_and_host_home",
    question:
      "Across all locations, how many persons does this community DSG/DSI/DSP program serve in total?",
    help:
      "This is one program-wide total, not a per-location count — count every person once even if " +
      "they attend more than one location or group. 4 or more requires a Day Treatment license from " +
      "the Office of Licensing (OL); 3 or fewer requires Community Based Day Support certification.",
    whyItMatters:
      "REQ-7.5.b / REQ-8.5.b (DHHS91172 §7.5(b), §8.5(b)) require the license or certification " +
      "\"regardless if the Persons all receive services at the same time, same location, or in the " +
      'same groups" — a single agency-wide credential keyed on the program total, not on any one ' +
      "location. Per-location capacity (whether a given site needs its own license) is a separate, " +
      "already-collected fact — see Homes & Teams.",
    answerType: "number",
    baseRequired: false,
    condition: {
      description: "Visible only when a community day-support code (DSG, DSI, DSP) is awarded.",
      visible: awardedAny("DSG", "DSI", "DSP"),
    },
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_community_program_total_persons_served",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-063"],
    sourceRequirementIds: reqIdsFor("FACT-063"),
    sourceNote:
      'FACT-063 was previously (incorrectly) a DEFERRED_FACTS "location" entry. The requirement ' +
      'catalog\'s own applies_to field for both REQ-7.5.b and REQ-8.5.b is "agency", not "site" — ' +
      "unlike FACT-062's sibling REQ-7.5.a/REQ-8.5.a, which really is applies_to: \"site\" (\"for " +
      'EACH LOCATION\") and stays a location-record fact. The clause text for 7.5(b)/8.5(b) is ' +
      'explicit that this is one number across the whole program ("regardless if the Persons... ' +
      'same location"), so it has no single location to attach to and is collectible at agency ' +
      "setup — no location needs to exist first. Not marked baseRequired: true — deliberately kept " +
      "out of org_setup_is_complete()'s required-fact list for this change, since correctly " +
      "threading a newly-required field through both the SQL and TypeScript completion-gate " +
      "implementations (which the existing migration comment requires to match exactly) needs " +
      "end-to-end re-verification of the create-blocking gate beyond this task's remaining scope. " +
      "Still visible and answerable in the wizard; just does not block setup completion yet.",
  },
  {
    id: "q_operates_ol_site",
    factKey: "operates_ol_site",
    introducedInVersion: 1,
    scope: "agency",
    section: "locations_and_licensing",
    question:
      "Does this contractor operate an Office of Licensing (OL) licensed or certified site?",
    help: "Zoning / Life Safety documentation applies only when an OL site is in use.",
    answerType: "boolean",
    baseRequired: true,
    storage: { kind: "column", table: "organizations", column: "fact_operates_ol_site" },
    sourceFactIds: ["FACT-006", "FACT-069"],
    sourceRequirementIds: reqIdsFor("FACT-006", "FACT-069"),
    affects: ["location_ol_license", "location_zoning_life_safety"],
    sourceNote:
      'FACT-006/FACT-069 ask this per location ("which OL licenses ... per location?"). No site ' +
      "entity exists at agency-setup time, so this single agency-wide screening question gates " +
      "visibility; the actual per-location license/cert/zoning answers are deferred to each " +
      "location (Homes & Teams) record — see DEFERRED_FACTS.",
  },
  {
    id: "q_uses_volunteers",
    factKey: "uses_volunteers",
    introducedInVersion: 1,
    scope: "agency",
    section: "workforce_and_governance",
    question: "Does this contractor use regularly scheduled volunteers?",
    help: "Friends and natural supports the person chooses are not volunteers. Answer yes only for regularly scheduled volunteer staff.",
    answerType: "boolean",
    baseRequired: true,
    storage: { kind: "column", table: "organizations", column: "fact_uses_volunteers" },
    sourceFactIds: ["FACT-035", "FACT-065"],
    sourceRequirementIds: reqIdsFor("FACT-035", "FACT-065"),
    sourceNote:
      'FACT-065 ("...which clients?") is the per-client tail of this fact — see DEFERRED_FACTS for ' +
      "the explicit fact_id mapping.",
  },
  {
    id: "q_has_governing_board",
    factKey: "has_governing_board",
    introducedInVersion: 1,
    scope: "agency",
    section: "workforce_and_governance",
    question: "Does this contractor have a governing or policy-making board?",
    help: "By-laws and quarterly minutes apply only when such a board exists.",
    answerType: "boolean",
    baseRequired: true,
    storage: { kind: "column", table: "organizations", column: "fact_has_governing_board" },
    sourceFactIds: ["FACT-057", "FACT-070"],
    sourceRequirementIds: reqIdsFor("FACT-057", "FACT-070"),
    sourceNote:
      "FACT-057 and FACT-070 ask the same thing at the same scope — merged into one question.",
  },
  {
    id: "q_provides_respite_overnight",
    factKey: "fact_provides_respite_overnight",
    introducedInVersion: 2,
    scope: "agency",
    section: "residential_and_host_home",
    question: "Does this contractor provide respite care, including overnight respite?",
    answerType: "boolean",
    baseRequired: true,
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_provides_respite_overnight",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-016"],
    sourceRequirementIds: reqIdsFor("FACT-016"),
  },
  {
    id: "q_provides_transportation",
    factKey: "fact_provides_transportation",
    introducedInVersion: 2,
    scope: "agency",
    section: "transportation",
    question:
      "Does this contractor provide transportation — do staff drive persons as part of service delivery?",
    answerType: "boolean",
    baseRequired: true,
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_provides_transportation",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-080", "FACT-003"],
    sourceRequirementIds: reqIdsFor("FACT-080", "FACT-003"),
    affects: ["driving_record_transport_deferred"],
    sourceNote:
      'FACT-003 is a compound staff-scope fact ("...which staff drive?"). Its agency-level half ' +
      'merges here; its staff-level half ("which staff drive") is already covered by the ' +
      'existing transport-assignment live path (src/lib/obligations/setup-facts.ts "transport") ' +
      "— see DEFERRED_FACTS for the explicit fact_id mapping.",
  },
  {
    id: "q_is_usor_vendor",
    factKey: "fact_is_usor_vendor",
    introducedInVersion: 2,
    scope: "agency",
    section: "employment_services",
    question: "Is this contractor an approved USOR (Utah State Office of Rehabilitation) vendor?",
    answerType: "boolean",
    baseRequired: true,
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_is_usor_vendor",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-036"],
    sourceRequirementIds: reqIdsFor("FACT-036"),
  },
  {
    id: "q_supports_self_administered_medication",
    factKey: "fact_supports_self_administered_medication",
    introducedInVersion: 2,
    scope: "agency",
    section: "clinical_and_behavior_support",
    question:
      "Does this contractor support clients in self-directing or self-administering their own medications?",
    answerType: "boolean",
    baseRequired: true,
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_supports_self_administered_medication",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-073"],
    sourceRequirementIds: reqIdsFor("FACT-073"),
  },
  {
    id: "q_acts_as_representative_payee",
    factKey: "fact_acts_as_representative_payee",
    introducedInVersion: 2,
    scope: "agency",
    section: "client_funds",
    question:
      "Does this contractor ever act as a Social Security representative payee, or otherwise assist any client with personal funds?",
    help:
      "This is a screening question about your general practice, not any one client. If you already " +
      "track a client's funds in the Client Funds (PBA) ledger, the answer is yes.",
    answerType: "boolean",
    baseRequired: true,
    storage: {
      kind: "column",
      table: "organizations",
      column: "fact_acts_as_representative_payee",
      isNewColumn: true,
    },
    sourceFactIds: ["FACT-078"],
    sourceRequirementIds: reqIdsFor("FACT-078"),
    sourceNote:
      'FACT-078 is scoped "client" in the workbook but reads as an aggregate ("...for any ' +
      'client?") — reclassified here as the agency-level screening fact. The per-client instance ' +
      "(FACT-018, FACT-058, FACT-079) stays deferred to each client's record and is the " +
      "authoritative answer for that client regardless of this screening answer.",
  },
] as const;

const BY_FACT_KEY = new Map(AGENCY_SETUP_QUESTIONS.map((q) => [q.factKey, q]));
const BY_ID = new Map(AGENCY_SETUP_QUESTIONS.map((q) => [q.id, q]));

export function agencySetupQuestionByFactKey(
  factKey: string,
): AgencySetupQuestionDefinition | null {
  return BY_FACT_KEY.get(factKey) ?? null;
}

export function agencySetupQuestionById(id: string): AgencySetupQuestionDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function isQuestionVisible(
  q: AgencySetupQuestionDefinition,
  ctx: AgencyAnswerContext,
): boolean {
  return q.condition ? q.condition.visible(ctx) : true;
}

export function isQuestionRequired(
  q: AgencySetupQuestionDefinition,
  ctx: AgencyAnswerContext,
): boolean {
  if (!isQuestionVisible(q, ctx)) return false;
  if (!q.condition) return q.baseRequired;
  return q.baseRequired && (q.condition.required ?? q.condition.visible)(ctx);
}

export function visibleAgencySetupQuestions(
  ctx: AgencyAnswerContext,
): AgencySetupQuestionDefinition[] {
  return AGENCY_SETUP_QUESTIONS.filter((q) => isQuestionVisible(q, ctx));
}

export function requiredAgencySetupQuestions(
  ctx: AgencyAnswerContext,
): AgencySetupQuestionDefinition[] {
  return AGENCY_SETUP_QUESTIONS.filter((q) => isQuestionRequired(q, ctx));
}

export function agencySetupQuestionsBySection(ctx: AgencyAnswerContext): Array<{
  section: AgencySetupSection;
  label: string;
  questions: AgencySetupQuestionDefinition[];
}> {
  return AGENCY_SETUP_SECTIONS.map((section) => ({
    section,
    label: AGENCY_SETUP_SECTION_LABELS[section],
    questions: AGENCY_SETUP_QUESTIONS.filter(
      (q) => q.section === section && isQuestionVisible(q, ctx),
    ),
  })).filter((s) => s.questions.length > 0);
}

/** Section is shown only while at least one of its questions is visible. */
export function isSectionVisible(section: AgencySetupSection, ctx: AgencyAnswerContext): boolean {
  return AGENCY_SETUP_QUESTIONS.some((q) => q.section === section && isQuestionVisible(q, ctx));
}

// ---------------------------------------------------------------------------
// Conditional "what this unlocks" callouts — not stored questions, just
// pointers to already-working features. Drives the acceptance behavior that
// PPS / RHS / PBA each surface a distinct conditional section in the wizard.
// ---------------------------------------------------------------------------

export type SectionCodeCallout = {
  id: string;
  section: AgencySetupSection;
  whenAwardedAny: readonly string[];
  title: string;
  body: string;
  linkTo?: string;
  linkLabel?: string;
};

export const SECTION_CODE_CALLOUTS: readonly SectionCodeCallout[] = [
  {
    id: "callout_rhs",
    section: "residential_and_host_home",
    whenAwardedAny: ["RHS"],
    title: "RHS — staffed residential homes",
    body:
      "RHS homes use coverage requirements and coverage bars, and staff clock for payroll (not " +
      "EVV). Nested 1:1 DSI/SEI segments inside a base shift are not overlap conflicts. Set up " +
      "each home, its capacity, and its OL licensing under Homes & Teams.",
    linkTo: "/dashboard/teams",
    linkLabel: "Go to Homes & Teams",
  },
  {
    id: "callout_hhs_pps",
    section: "residential_and_host_home",
    whenAwardedAny: ["HHS", "PPS"],
    title: "HHS / PPS — host-home and professional-parent supports",
    body:
      "Hosts never clock or appear in shift scheduling — their compliance artifact is the daily " +
      "note plus overnight confirmation (no overnight stay makes the day unbillable). Agency staff " +
      "who visit a host home ARE timed shifts.",
  },
  {
    id: "callout_pba",
    section: "client_funds",
    whenAwardedAny: ["PBA"],
    title: "PBA — Personal Budget Assistant",
    body:
      "Track each client's funds in the existing Client Funds (PBA) ledger — balances, " +
      "transactions (a receipt is required over $50), and the quarterly audit sample are already " +
      "built. This questionnaire only records whether you act as payee at all; per-client accounts " +
      "live on each client's record.",
  },
] as const;

export function activeSectionCodeCallouts(ctx: AgencyAnswerContext): SectionCodeCallout[] {
  return SECTION_CODE_CALLOUTS.filter((c) =>
    c.whenAwardedAny.some((code) => ctx.awardedCodes.includes(code)),
  );
}

// ---------------------------------------------------------------------------
// Non-question dispositions — workbook facts that are derived or static
// rules, never an owner-facing question. Listed explicitly so the coverage
// table can account for all 85 rows without inventing a fake question.
// ---------------------------------------------------------------------------

export type NonQuestionFactDisposition = {
  factId: string;
  disposition: "derived" | "rule";
  detail: string;
};

export const NON_QUESTION_FACT_DISPOSITIONS: readonly NonQuestionFactDisposition[] = [
  {
    factId: "FACT-071",
    disposition: "derived",
    detail:
      '"Does the agency provide ONLY CHA, HSQ or PBA?" is computed from awarded codes by the ' +
      "existing humanRightsPlanStatus()/CHA_HSQ_PBA rule in applicability.ts — asking it again " +
      "would invite a contradictory second answer.",
  },
  {
    factId: "FACT-076",
    disposition: "rule",
    detail:
      "Fixed code-exemption list for Support Strategies (ELS, MTP, PBA, PM1/PM2, Respite). A " +
      "platform rule, not a fact any one agency answers.",
  },
  {
    factId: "FACT-077",
    disposition: "rule",
    detail:
      "Fixed cadence-by-code rule (monthly summaries replace quarterly for CMP/CMS/PN1/PN2/SEI/" +
      "SJD; PBA gets a monthly financial statement) — matches CLAUDE.md's Summary cadences. A " +
      "platform rule, not a fact any one agency answers.",
  },
  {
    factId: "FACT-054",
    disposition: "derived",
    detail:
      "Client age is derived from clients.date_of_birth whenever needed — no separate fact to collect.",
  },
] as const;
