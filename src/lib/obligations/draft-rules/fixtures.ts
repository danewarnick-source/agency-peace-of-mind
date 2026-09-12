/**
 * Core_Rule_Logic slice — Stages 1–4 draft fixtures.
 * Every imported rule is draft / not_published. Source_index is archive
 * metadata. Clause ids come from the workbook / encoded SOW articles already
 * cited on the live pack. No invented renewal intervals. Release_Gaps stay
 * unresolved (USOR email spelling, SJB typo, EVV mapping review, universal
 * retention) — do not invent a fix.
 */

import { THIRTY_DAY_SOW_LETTERS, THIRTY_DAY_TOPIC_CITE } from "../../in-hive-training.ts";
import { linkWorkbookSource, WORKBOOK_SOURCE_INDEX } from "./source.ts";
import type {
  CompletionRoute,
  DraftPredicate,
  DraftRule,
  DraftRuleTest,
  EvidenceAcceptance,
  GroupMember,
  NestedRoute,
  TimingAnchor,
} from "./types.ts";

const NO_EQUIV: EvidenceAcceptance["automaticEquivalency"] = false;

function tests(prefix: string, rows: Array<[DraftRuleTest["kind"], string]>): DraftRuleTest[] {
  return rows.map(([kind, assert], i) => ({
    id: `${prefix}-t${i + 1}`,
    kind,
    assert,
  }));
}

function evidence(
  summary: string,
  routes: CompletionRoute[],
  defaultHandlingLabel: string,
): EvidenceAcceptance {
  return {
    summary,
    routes,
    defaultHandlingLabel,
    automaticEquivalency: NO_EQUIV,
  };
}

function draftBase(
  partial: Omit<
    DraftRule,
    | "lifecycle"
    | "publication"
    | "approval"
    | "sourceIndex"
    | "unresolvedAlternatives"
    | "unresolvedRenewals"
    | "releaseGaps"
  > & {
    unresolvedAlternatives?: string[];
    unresolvedRenewals?: string[];
    releaseGaps?: string[];
  },
): DraftRule {
  return {
    ...partial,
    lifecycle: "draft",
    publication: "not_published",
    sourceIndex: WORKBOOK_SOURCE_INDEX,
    approval: null,
    unresolvedAlternatives: partial.unresolvedAlternatives ?? [],
    unresolvedRenewals: partial.unresolvedRenewals ?? [],
    releaseGaps: partial.releaseGaps ?? [],
  };
}

function sowLetterMembers(
  letters: readonly string[],
  cite: Record<string, string>,
  clausePrefix: string,
  routes: CompletionRoute[],
): GroupMember[] {
  return letters.map((code) => ({
    id: `topic-${code}`,
    label: cite[code] ?? `Topic ${code}`,
    sourceClauseId: `${clausePrefix}(${code})`,
    catalogKey: null,
    topicCode: code,
    completionRoutes: routes,
    evidenceMatch: { scope: "orientation", requiredCoverage: [code] },
  }));
}

const ORIENTATION_CLAUSES = [
  "SOW §1.8(4)",
  ...THIRTY_DAY_SOW_LETTERS.map((c) => `SOW §1.8(4)(${c})`),
];

/** SOW §1.8(8)(A)–(F) labels already cited on the live ABI pack / audit tool. */
const ABI_SOW_TOPICS = [
  { code: "A", title: "How brain injury can change behavior" },
  { code: "B", title: "From hospital to community support" },
  { code: "C", title: "What function means day to day" },
  { code: "D", title: "Health and medication after brain injury" },
  { code: "E", title: "Staff role and supervisor role in rehab" },
  { code: "F", title: "The family's side of a brain injury" },
] as const;

const ABI_CLAUSES = ["SOW §1.8(8)", ...ABI_SOW_TOPICS.map((t) => `SOW §1.8(8)(${t.code})`)];

const HIRE_PRED: DraftPredicate = {
  kind: "direct_support_assignment",
  catalogKey: "orientation_30_day",
};

export const REQ_1_8_4_ORIENTATION: DraftRule = draftBase({
  id: "REQ-1.8.4",
  version: 1,
  title: "30-day orientation — ALL topics, one parent assignment",
  catalogKeys: ["orientation_30_day"],
  source: linkWorkbookSource(ORIENTATION_CLAUSES),
  predicates: [HIRE_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: sowLetterMembers(THIRTY_DAY_SOW_LETTERS, THIRTY_DAY_TOPIC_CITE, "SOW §1.8(4)", [
      "IN_PLATFORM",
    ]),
  },
  timing: { kind: "hire_plus_days", days: 30 },
  evidence: evidence(
    "One parent staff task. Completing every SOW §1.8(4)(A)–(W) topic plus the competency exam satisfies the parent. Completing any one topic does not.",
    ["IN_PLATFORM", "UPLOAD"],
    "In-platform course is the default handling path; an upload is accepted evidence, not automatic equivalency for a skipped topic.",
  ),
  completionRoutes: ["IN_PLATFORM", "UPLOAD"],
  tests: tests("REQ-1.8.4", [
    [
      "positive",
      "Direct-support staff with A–W complete receive one parent orientation task marked complete.",
    ],
    [
      "negative",
      "Office staff with no client assignment do not receive the orientation parent task.",
    ],
    [
      "boundary",
      "ALL group stays incomplete when any one A–W topic is missing; never ANY-one-topic.",
    ],
  ]),
});

const FA_TIMING: TimingAnchor = { kind: "certificate_expiry", certKey: "first_aid" };
const CPR_TIMING: TimingAnchor = { kind: "certificate_expiry", certKey: "cpr" };
const PCT_TIMING: TimingAnchor = {
  kind: "none",
  reason: "SOW §1.8(5)(C) is hire+90 with no workbook renewal interval. Do not invent PCT expiry.",
};

export const REQ_1_8_5_FA_CPR_PCT: DraftRule = draftBase({
  id: "REQ-1.8.5",
  version: 1,
  title: "First aid + CPR + person-centered thinking — ALL three",
  catalogKeys: ["cpr_first_aid_initial", "cpr_first_aid_renewal", "pct_hire_practices"],
  source: linkWorkbookSource(["SOW §1.8(5)", "SOW §1.8(5)(A)", "SOW §1.8(5)(B)", "SOW §1.8(5)(C)"]),
  predicates: [{ kind: "direct_support_assignment", catalogKey: "cpr_first_aid_initial" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "first_aid",
        label: "Current First Aid",
        sourceClauseId: "SOW §1.8(5)(A)",
        catalogKey: "cpr_first_aid_initial",
        timing: FA_TIMING,
        completionRoutes: ["UPLOAD"],
      },
      {
        id: "cpr",
        label: "Current CPR",
        sourceClauseId: "SOW §1.8(5)(B)",
        catalogKey: "cpr_first_aid_initial",
        timing: CPR_TIMING,
        completionRoutes: ["UPLOAD"],
        evidenceMatch: { scope: "cpr" },
      },
      {
        id: "person_centered",
        label: "Person-centered thinking and practices",
        sourceClauseId: "SOW §1.8(5)(C)",
        catalogKey: "pct_hire_practices",
        timing: PCT_TIMING,
        completionRoutes: ["IN_PLATFORM", "UPLOAD"],
      },
    ],
  },
  timing: { kind: "hire_plus_days", days: 90 },
  evidence: evidence(
    "ALL three required within 90 days of hire. CPR and First Aid keep distinct printed expirations. Person-centered has no invented renewal.",
    ["IN_PLATFORM", "UPLOAD"],
    "Upload of a combined CPR/FA card is a handling path; each credential still expires on its own printed date.",
  ),
  completionRoutes: ["IN_PLATFORM", "UPLOAD"],
  tests: tests("REQ-1.8.5", [
    [
      "positive",
      "Direct-support staff with current FA, current CPR, and PCT within 90 days satisfy the ALL group.",
    ],
    ["negative", "Missing any one of FA, CPR, or PCT leaves the parent incomplete."],
    [
      "boundary",
      "FA expiry and CPR expiry are distinct; PCT completion does not receive an invented expiry.",
    ],
  ]),
});

export const REQ_1_8_8_ABI: DraftRule = draftBase({
  id: "REQ-1.8.8",
  version: 1,
  title: "ABI training — assignment-gated ALL topics",
  catalogKeys: ["abi_training"],
  source: linkWorkbookSource(ABI_CLAUSES),
  predicates: [{ kind: "abi_caseload", catalogKey: "abi_training" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: ABI_SOW_TOPICS.map((t) => ({
      id: `abi-${t.code}`,
      label: t.title,
      sourceClauseId: `SOW §1.8(8)(${t.code})`,
      catalogKey: "abi_training",
      topicCode: t.code,
      completionRoutes: ["IN_PLATFORM"] as CompletionRoute[],
    })),
  },
  timing: {
    kind: "none",
    reason: "Required before working alone with an ABI caseload — no hire+N invented here.",
  },
  evidence: evidence(
    "One parent ABI task. ALL §1.8(8)(A)–(F) topics required. Assignment-gated: no ABI caseload → does not apply only when that fact is known.",
    ["IN_PLATFORM", "UPLOAD"],
    "In-platform ABI course is the default handling path; upload is accepted evidence, not topic equivalency.",
  ),
  completionRoutes: ["IN_PLATFORM", "UPLOAD"],
  tests: tests("REQ-1.8.8", [
    [
      "positive",
      "Staff with an ABI caseload and A–F complete receive one parent ABI task marked complete.",
    ],
    ["negative", "Staff known to have no ABI caseload do not receive the ABI parent task."],
    [
      "boundary",
      "Unknown ABI caseload is missing-information, never auto N/A; ALL group incomplete if one topic is missing.",
    ],
  ]),
});

export const REQ_1_8_7_CE12: DraftRule = draftBase({
  id: "REQ-1.8.7",
  version: 1,
  title: "12-hour employment-year continuing education",
  catalogKeys: ["ce_12h_annual"],
  source: linkWorkbookSource(["SOW §1.8(7)"]),
  predicates: [{ kind: "direct_support_assignment", catalogKey: "ce_12h_annual" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "hours-12",
        label: "12 DSPD-approved hours in the employment year",
        sourceClauseId: "SOW §1.8(7)",
        catalogKey: "ce_12h_annual",
        completionRoutes: ["UPLOAD", "IN_PLATFORM"],
      },
    ],
  },
  timing: { kind: "employment_year", startYear: 2 },
  evidence: evidence(
    "Minimum 12 hours in the second and subsequent employment years. Window is hire-anniversary to hire-anniversary. Completion does not reset the anniversary.",
    ["UPLOAD", "IN_PLATFORM"],
    "In-platform 12-hour placeholder is a handling label only and does not automatically fulfill the hours.",
  ),
  completionRoutes: ["UPLOAD", "IN_PLATFORM"],
  tests: tests("REQ-1.8.7", [
    [
      "positive",
      "Direct-support staff in employment year 2+ with 12 hours in the anniversary window satisfy the rule.",
    ],
    ["negative", "Office staff without a client assignment do not receive the 12-hour clock."],
    [
      "boundary",
      "Completing 12 hours early does not shift the next due date off the hire anniversary.",
    ],
  ]),
});

const SEI_PRED: DraftPredicate = { kind: "sei_assignment", catalogKey: "acre_sei" };

export const REQ_SEI_30_6_B: DraftRule = draftBase({
  id: "REQ-30.6.b",
  version: 1,
  title: "SEI 30.6(b) — agency ACRE coverage AND per-staff supervisor",
  catalogKeys: ["acre_sei"],
  source: linkWorkbookSource(["SOW §30.6(b)"]),
  predicates: [SEI_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "agency-acre-coverage",
        label: "Agency has ACRE-certified coverage",
        sourceClauseId: "SOW §30.6(b)",
        catalogKey: null,
        completionRoutes: ["EXTERNAL", "UPLOAD"],
      },
      {
        id: "staff-acre-supervisor",
        label: "SEI staff is supervised by an ACRE-certified supervisor",
        sourceClauseId: "SOW §30.6(b)",
        catalogKey: "acre_sei",
        completionRoutes: ["SYSTEM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Required before providing SEI. No invented annual ACRE interval.",
  },
  evidence: evidence(
    "BOTH agency ACRE coverage and a per-staff ACRE supervisor. Completing one side does not satisfy the other. Independent of 30.6(c) course routes.",
    ["EXTERNAL", "UPLOAD", "SYSTEM"],
    "Supervisor assignment is a system fact, not an automatic course equivalency.",
  ),
  completionRoutes: ["EXTERNAL", "UPLOAD", "SYSTEM"],
  tests: tests("REQ-30.6.b", [
    [
      "positive",
      "SEI staff at an agency with ACRE coverage and an ACRE supervisor satisfy BOTH members.",
    ],
    [
      "negative",
      "SEI staff with agency coverage but no ACRE supervisor leave the ALL group incomplete.",
    ],
    [
      "boundary",
      "Unknown agency coverage or unknown supervisor is missing-information, never auto compliant.",
    ],
  ]),
});

export const REQ_SEI_30_6_C: DraftRule = draftBase({
  id: "REQ-30.6.c",
  version: 1,
  title: "SEI 30.6(c) — ANY named course route, independent of 30.6(b)",
  catalogKeys: ["acre_sei"],
  source: linkWorkbookSource(["SOW §30.6(c)"]),
  predicates: [SEI_PRED],
  group: {
    logic: "ANY",
    parentAssignment: "one",
    members: [
      {
        id: "course-acre",
        label: "ACRE training",
        sourceClauseId: "SOW §30.6(c)",
        catalogKey: "acre_sei",
        completionRoutes: ["UPLOAD", "EXTERNAL"],
      },
      {
        id: "course-usu-workplace",
        label: "USU Workplace Supports",
        sourceClauseId: "SOW §30.6(c)",
        catalogKey: "acre_sei",
        completionRoutes: ["UPLOAD", "EXTERNAL"],
      },
      {
        id: "course-effective-job-coach",
        label: "Effective Job Coach training",
        sourceClauseId: "SOW §30.6(c)",
        catalogKey: "acre_sei",
        completionRoutes: ["UPLOAD", "EXTERNAL"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Required before providing SEI. Named-course ANY is independent of 30.6(b). No invented interval.",
  },
  evidence: evidence(
    "ANY one named course (ACRE, USU Workplace Supports, or Effective Job Coach) satisfies 30.6(c). That completion does not satisfy 30.6(b).",
    ["UPLOAD", "EXTERNAL"],
    "Named-course route is a permitted completion set, not automatic equivalency for agency coverage or supervision.",
  ),
  completionRoutes: ["UPLOAD", "EXTERNAL"],
  tests: tests("REQ-30.6.c", [
    ["positive", "SEI staff with any one named course satisfy 30.6(c)."],
    [
      "negative",
      "SEI staff with no named course leave 30.6(c) incomplete even if 30.6(b) BOTH sides are present.",
    ],
    ["boundary", "30.6(c) ANY is evaluated independently of 30.6(b) ALL."],
  ]),
});

/** Named 1.8.6 programs already cited on the live catalog / audit tool. */
export const BEHAVIOR_APPROVED_PROGRAMS = ["SOAR", "MANDT", "PART", "CPI", "Safety Care"] as const;

/** Published destination as written. Do not invent a corrected address. */
export const USOR_PROOF_DESTINATION_AS_PUBLISHED = "osrprovider@utah.gov";
export const USOR_COHORT_CUTOVER = "2026-07-01";
export const USOR_EXISTING_PROVIDER_DEADLINE = "2027-01-31";

/** Monthly substitutes under §1.25. Same set as progress-summaries (minus PBA financials). */
export const PERIODIC_MONTHLY_CODES = ["CMP", "CMS", "PN1", "PN2", "SEI", "SJD"] as const;
export const PERIODIC_QUARTERLY_CODES = ["HHS", "RHS", "DSI", "SLH", "SLN"] as const;

const BEHAVIOR_PRED: DraftPredicate = {
  kind: "behavior_risk_assignment",
  catalogKey: "behavior_intervention_cert",
};

function behaviorRoute(program: (typeof BEHAVIOR_APPROVED_PROGRAMS)[number]): NestedRoute {
  const slug = program.toLowerCase().replace(/\s+/g, "-");
  return {
    id: `route-${slug}`,
    label: program,
    sourceClauseId: "SOW §1.8(6)",
    officialProgram: program,
    completionRoutes: ["UPLOAD"],
    conditions: [
      {
        id: `${slug}-official`,
        label: `Official ${program} program complete and current`,
        sourceClauseId: "SOW §1.8(6)",
        catalogKey: "behavior_intervention_cert",
        completionRoutes: ["UPLOAD"],
        requiresOfficialProgram: true,
      },
    ],
  };
}

export const REQ_1_8_6_BEHAVIOR: DraftRule = draftBase({
  id: "REQ-1.8.6",
  version: 1,
  title: "Behavior intervention certification — ANY approved complete route",
  catalogKeys: ["behavior_intervention_cert"],
  source: linkWorkbookSource(["SOW §1.8(6)"]),
  predicates: [BEHAVIOR_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "EXISTS assigned person with aggression / self-injury / destruction risk. ANY approved route; the selected route must satisfy ALL of its conditions. Newly arising risk requires review.",
    members: [
      {
        id: "newly-arising-review",
        label: "Newly arising risk reviewed",
        sourceClauseId: "SOW §1.8(6)",
        catalogKey: "behavior_intervention_cert",
        completionRoutes: ["SYSTEM"],
        condition: "newly_arising_risk",
      },
    ],
    routeLogic: "ANY",
    routes: [
      ...BEHAVIOR_APPROVED_PROGRAMS.map(behaviorRoute),
      {
        id: "route-alternative",
        label: "Other DSPD-approved intervention program",
        sourceClauseId: "SOW §1.8(6)",
        officialProgram: "DSPD-approved alternative",
        requiresDspdWrittenApproval: true,
        completionRoutes: ["UPLOAD", "EXTERNAL"],
        conditions: [
          {
            id: "alt-program",
            label: "Alternative intervention program complete",
            sourceClauseId: "SOW §1.8(6)",
            catalogKey: "behavior_intervention_cert",
            completionRoutes: ["UPLOAD", "EXTERNAL"],
            requiresOfficialProgram: true,
          },
          {
            id: "alt-dspd-approval",
            label: "Prior written DSPD approval for the alternative program",
            sourceClauseId: "SOW §1.8(6)",
            catalogKey: null,
            completionRoutes: ["UPLOAD", "EXTERNAL"],
          },
        ],
      },
    ],
  },
  timing: { kind: "hire_plus_days", days: 180 },
  evidence: evidence(
    "ANY named approved program (SOAR, MANDT, PART, CPI, Safety Care) or a DSPD-approved alternative with prior written approval. The selected route must satisfy ALL of its conditions. A generic quiz is not a substitute for an official program.",
    ["UPLOAD", "EXTERNAL", "SYSTEM"],
    "Upload of a named program certificate is the default handling path; it is not automatic equivalency for a different program or a generic quiz.",
  ),
  completionRoutes: ["UPLOAD", "EXTERNAL", "SYSTEM"],
  tests: tests("REQ-1.8.6", [
    [
      "positive",
      "Staff assigned to a person with aggression/self-injury/destruction risk who complete one official named route (and review if risk newly arose) satisfy the parent.",
    ],
    [
      "negative",
      "Staff known to have no such assigned person do not receive the behavior-cert parent. An alternative route without prior written DSPD approval is incomplete.",
    ],
    [
      "boundary",
      "Unknown risk assignment is missing-information. Newly arising risk requires review. Selected route must satisfy ALL of its conditions. Generic quiz is not an official program.",
    ],
  ]),
});

export const REQ_30_5_SEI_BENEFITS: DraftRule = draftBase({
  id: "REQ-30.5",
  version: 1,
  title: "SEI benefits knowledge — COUNT designated staff >= 1",
  catalogKeys: ["sei_ssi_benefits"],
  source: linkWorkbookSource(["SOW §30.5"]),
  predicates: [{ kind: "designated_benefits_staff", catalogKey: "sei_ssi_benefits" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "COUNT(qualified designated staff) >= 1. Not every SEI staff and not office staff by default.",
    members: [
      {
        id: "qualified-designated",
        label: "Designated staff is qualified on SSI / Title II / Medicaid earned-income",
        sourceClauseId: "SOW §30.5",
        catalogKey: "sei_ssi_benefits",
        completionRoutes: ["EXTERNAL", "UPLOAD"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Required of the designated qualified person before providing SEI. No invented renewal.",
  },
  evidence: evidence(
    "Agency must have at least one qualified designated staff member. Knowledge is acquired outside HIVE; HIVE records the designated person's qualification. Not assigned to every SEI or office staff member.",
    ["EXTERNAL", "UPLOAD", "SYSTEM"],
    "Attestation or upload is a handling path for the designated person, not automatic equivalency for the whole SEI roster.",
  ),
  completionRoutes: ["EXTERNAL", "UPLOAD", "SYSTEM"],
  tests: tests("REQ-30.5", [
    [
      "positive",
      "One designated staff member who is qualified satisfies COUNT>=1. That person receives the duty.",
    ],
    [
      "negative",
      "SEI staff who are not designated do not receive the duty. Office staff who are not designated do not receive the duty. Zero qualified designated staff fails COUNT>=1.",
    ],
    [
      "boundary",
      "Unknown designation or unknown qualification is missing-information, never auto compliant or N/A.",
    ],
  ]),
});

export const REQ_30_6_A_USOR: DraftRule = draftBase({
  id: "REQ-30.6.a",
  version: 1,
  title: "USOR approved vendor — cohort branches",
  catalogKeys: ["usor_job_coaching_sei"],
  source: linkWorkbookSource(["SOW §30.6(a)"]),
  predicates: [{ kind: "usor_sei_vendor", catalogKey: "usor_job_coaching_sei" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "official-usor-proof",
        label: "Official USOR approved-vendor proof on file",
        sourceClauseId: "SOW §30.6(a)",
        catalogKey: "usor_job_coaching_sei",
        completionRoutes: ["UPLOAD", "EXTERNAL"],
      },
    ],
  },
  timing: {
    kind: "usor_cohort",
    cutover: USOR_COHORT_CUTOVER,
    existingDeadline: USOR_EXISTING_PROVIDER_DEADLINE,
    awardPlusMonths: 6,
  },
  evidence: evidence(
    `Official USOR vendor proof. Published destination is ${USOR_PROOF_DESTINATION_AS_PUBLISHED} (Release_Gaps — do not invent a corrected address). HIVE stores the upload; it does not send the email.`,
    ["UPLOAD", "EXTERNAL"],
    "Upload of the official proof is the handling path, not automatic equivalency for a missing vendor letter.",
  ),
  completionRoutes: ["UPLOAD", "EXTERNAL"],
  releaseGaps: [
    `USOR destination email is published as ${USOR_PROOF_DESTINATION_AS_PUBLISHED}; do not invent a corrected address.`,
  ],
  tests: tests("REQ-30.6.a", [
    [
      "positive",
      "SEI awarded before 2026-07-01 with official proof by 2027-01-31 satisfies the existing-provider cohort.",
    ],
    [
      "negative",
      "SEI awarded on/after 2026-07-01 is incomplete without official proof by award+6 months.",
    ],
    [
      "boundary",
      "Unknown award date is missing-information (never default the live-UI fallback). Destination spelling stays a Release_Gaps flag.",
    ],
  ]),
});

export const REQ_32_5_CAREGIVER: DraftRule = draftBase({
  id: "REQ-32.5",
  version: 1,
  title: "DSPD New Caregiver Compensation training — CMP/CMS",
  catalogKeys: ["cmp_cms_caregiver_comp"],
  source: linkWorkbookSource(["SOW §32.5"]),
  predicates: [{ kind: "cmp_cms_assignment", catalogKey: "cmp_cms_caregiver_comp" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "official-dspd-course",
        label: "Official DSPD New Caregiver Compensation course (score >= 80%)",
        sourceClauseId: "SOW §32.5",
        catalogKey: "cmp_cms_caregiver_comp",
        completionRoutes: ["EXTERNAL"],
        requiresOfficialProgram: true,
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Required when assigned CMP or CMS. Course effective 7/1/26. No invented renewal interval.",
  },
  evidence: evidence(
    "Official DSPD New Caregiver Compensation course taken on the DSPD site. SLN alone does not trigger. A generic in-platform quiz is not a substitute.",
    ["EXTERNAL"],
    "EXTERNAL official course is the default handling path; it is not equivalency for a generic quiz or an SLN-only assignment.",
  ),
  completionRoutes: ["EXTERNAL"],
  tests: tests("REQ-32.5", [
    [
      "positive",
      "Staff assigned CMP or CMS who complete the official DSPD course satisfy the rule.",
    ],
    [
      "negative",
      "SLN alone does not trigger. Office staff without CMP/CMS do not receive the duty.",
    ],
    [
      "boundary",
      "A generic quiz cannot replace the official DSPD course. Unknown CMP/CMS assignment is missing-information.",
    ],
  ]),
});

export const REQ_33_5_SJD: DraftRule = draftBase({
  id: "REQ-33.5.b-c",
  version: 1,
  title: "SJD ACRE (60-day, supervised pending) + Customized Employment if Discovery",
  catalogKeys: ["acre_sjd", "customized_employment_usu"],
  source: linkWorkbookSource(["SOW §33.5(b)", "SOW §33.5(c)"]),
  predicates: [{ kind: "sjd_assignment", catalogKey: "acre_sjd" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "SJD ACRE within 60 days of hire with qualified supervision while pending. Customized Employment only if Discovery. Do not copy SEI 30.6(c) alternatives (USU Workplace Supports / Effective Job Coach) onto SJD.",
    members: [
      {
        id: "sjd-acre",
        label: "ACRE training within 60 days of hire",
        sourceClauseId: "SOW §33.5(b)",
        catalogKey: "acre_sjd",
        timing: { kind: "hire_plus_days", days: 60 },
        completionRoutes: ["UPLOAD", "EXTERNAL"],
        requiresOfficialProgram: true,
      },
      {
        id: "sjd-supervision-pending",
        label: "Qualified ACRE supervision while ACRE is pending",
        sourceClauseId: "SOW §33.5(b)",
        catalogKey: "acre_sjd",
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "sjd-customized-employment",
        label: "USU Customized Employment (Discovery)",
        sourceClauseId: "SOW §33.5(c)",
        catalogKey: "customized_employment_usu",
        completionRoutes: ["UPLOAD", "EXTERNAL"],
        condition: "sjd_discovery",
        requiresOfficialProgram: true,
      },
    ],
  },
  timing: { kind: "hire_plus_days", days: 60 },
  evidence: evidence(
    "ACRE for SJD new-hires within 60 days; qualified supervision required while ACRE is pending. Customized Employment if the staff performs Discovery. SEI named-course alternatives are not SJD routes.",
    ["UPLOAD", "EXTERNAL", "SYSTEM"],
    "Upload of ACRE / Customized Employment is a handling path, not equivalency for SEI alternative courses.",
  ),
  completionRoutes: ["UPLOAD", "EXTERNAL", "SYSTEM"],
  releaseGaps: [
    "Workbook typo SJB is a publication gap; encoded service code is SJD. Do not treat SJB as a live code.",
  ],
  tests: tests("REQ-33.5.b-c", [
    [
      "positive",
      "SJD staff with ACRE within 60 days (supervised while pending) satisfy 33.5(b). Discovery staff also need Customized Employment.",
    ],
    [
      "negative",
      "SJD staff past 60 days without ACRE stay incomplete even with supervision. Non-Discovery staff do not receive Customized Employment. SEI alternatives do not satisfy SJD.",
    ],
    [
      "boundary",
      "Unknown SJD assignment or unknown Discovery fact is missing-information. SJB typo stays a Release_Gaps flag.",
    ],
  ]),
});

export const REQ_1_25_PERIODIC: DraftRule = draftBase({
  id: "REQ-1.25",
  version: 1,
  title: "Periodic progress reports — monthly substitutes, never both for one code",
  catalogKeys: ["sei_monthly_summary_upi", "cmp_cms_monthly_summaries", "sjd_monthly_summary_upi"],
  source: linkWorkbookSource(["SOW §1.25"]),
  predicates: [{ kind: "periodic_report", catalogKey: null }],
  group: {
    logic: "CONDITIONAL",
    parentAssignment: "one",
    conditionNote:
      "Default quarterly. Monthly substitutes for CMP, CMS, PN1, PN2, SEI, SJD. One applicable report per code — never duplicate monthly+quarterly on the same code.",
    members: [
      {
        id: "monthly-report",
        label: "Monthly progress report (CMP/CMS/PN1/PN2/SEI/SJD)",
        sourceClauseId: "SOW §1.25",
        catalogKey: null,
        completionRoutes: ["IN_PLATFORM", "SYSTEM"],
        condition: "monthly_summary_codes",
      },
      {
        id: "quarterly-report",
        label: "Quarterly progress report (default cadence)",
        sourceClauseId: "SOW §1.25",
        catalogKey: null,
        completionRoutes: ["IN_PLATFORM", "SYSTEM"],
        condition: "quarterly_summary_codes",
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Cadence is monthly or quarterly by code. Due 15 days after the period ends. No invented extra interval.",
  },
  evidence: evidence(
    "One applicable narrative report per code. Monthly substitutes for CMP/CMS/PN1/PN2/SEI/SJD; all other narrative codes stay quarterly. Never mint both monthly and quarterly for the same code.",
    ["IN_PLATFORM", "SYSTEM"],
    "In-platform summary is the default handling path, not equivalency for a skipped cadence.",
  ),
  completionRoutes: ["IN_PLATFORM", "SYSTEM"],
  tests: tests("REQ-1.25", [
    ["positive", "HHS/SLN receive quarterly only. SEI/SJD/CMP/CMS/PN1/PN2 receive monthly only."],
    ["negative", "Office staff with no assigned codes do not receive a periodic report clock."],
    [
      "boundary",
      "A code never receives both monthly and quarterly. Mixed caseloads (CMP+SLN) get one monthly and one quarterly for different codes. Unknown codes stay missing-information.",
    ],
  ]),
});

const DOC_PRED: DraftPredicate = {
  kind: "service_documentation",
  catalogKey: "timesheets_attendance",
};
const TIMESHEET_PRED: DraftPredicate = {
  kind: "payroll_timesheet",
  catalogKey: "timesheets_attendance",
};
const EVV_PRED: DraftPredicate = { kind: "evv_mandated", catalogKey: "evv_visit_verification" };
const SIGN_PRED: DraftPredicate = {
  kind: "signature_attestation",
  catalogKey: "timesheets_attendance",
};
const ART2_PRED: DraftPredicate = {
  kind: "billing_restriction",
  catalogKey: "billing_service_match",
};

export const REQ_1_10_7_NOTES: DraftRule = draftBase({
  id: "REQ-1.10.7",
  version: 1,
  title: "Service documentation / notes — general schema unless explicit override",
  catalogKeys: ["timesheets_attendance", "hhs_billable_day"],
  source: linkWorkbookSource(["SOW §1.10(7)", "SOW Article 11", "CST 55", "CST 56"]),
  predicates: [DOC_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Select the template by the actual service code + service date. General five-field note unless an explicit HHS override applies. Completing the note does not satisfy EVV, timesheet, signature, or reporting.",
    members: [
      {
        id: "note-person",
        label: "Person",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
      {
        id: "note-date",
        label: "Date",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
      {
        id: "note-service-code",
        label: "Service code",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
      {
        id: "note-staff",
        label: "Staff",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
      {
        id: "note-summary",
        label: "Summary note",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
      {
        id: "note-start-end",
        label: "Start/end time (quarter-hour codes)",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
        condition: "quarter_hour_code",
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Per instance of service. Template is chosen on the service date. No invented extra interval.",
  },
  evidence: evidence(
    "General five-field note (Person, date, service code, staff, summary). Start/end is CONDITIONAL for quarter-hour codes. HHS uses the encoded host-home daily note + overnight confirmation, not this punch schema. Completing the note never absorbs EVV, payroll/timesheet, signature, or reporting.",
    ["IN_PLATFORM"],
    "In-platform note is the default handling path; it is not equivalency for EVV, timesheet, signature, or reporting.",
  ),
  completionRoutes: ["IN_PLATFORM"],
  tests: tests("REQ-1.10.7", [
    [
      "positive",
      "SLN on a post-7/1/26 date uses the general five-field template; all ALL fields plus start/end complete the note.",
    ],
    [
      "negative",
      "Wrong service code selects the wrong template (HHS override vs general). A five-field note does not complete EVV, timesheet, signature, or reporting.",
    ],
    [
      "boundary",
      "Missing any required field leaves the note incomplete. Pre-7/1/26 dates have no invented historical schema.",
    ],
  ]),
});

export const REQ_1_10_7_TIMESHEET: DraftRule = draftBase({
  id: "REQ-1.10.7-timesheet",
  version: 1,
  title: "Payroll / timesheet attendance record — independent of the note",
  catalogKeys: ["timesheets_attendance"],
  source: linkWorkbookSource(["SOW §1.10(7)", "CST 55", "CST 56"]),
  predicates: [TIMESHEET_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Time entry is the attendance record. Independent of the service-documentation note.",
    members: [
      {
        id: "timesheet-entry",
        label: "Attendance / timesheet entry recorded",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["SYSTEM", "IN_PLATFORM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Per instance of service. Independent of the five-field note.",
  },
  evidence: evidence(
    "HIVE time entries are the attendance record. Completing a daily note does not satisfy this lane.",
    ["SYSTEM", "IN_PLATFORM"],
    "Clock / timesheet is the default handling path, not equivalency for a narrative note.",
  ),
  completionRoutes: ["SYSTEM", "IN_PLATFORM"],
  tests: tests("REQ-1.10.7-timesheet", [
    ["positive", "A recorded timesheet entry satisfies the payroll/attendance lane."],
    ["negative", "A complete five-field note without a timesheet leaves this lane incomplete."],
    [
      "boundary",
      "Unknown assignment is missing-information. HHS host-home days still need the attendance artifact.",
    ],
  ]),
});

export const REQ_1_12_EVV: DraftRule = draftBase({
  id: "REQ-1.12",
  version: 1,
  title: "EVV-mandated codes — independent of the service note",
  catalogKeys: ["evv_visit_verification"],
  source: linkWorkbookSource(["SOW §1.12"]),
  predicates: [EVV_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Applies only when the assigned code is EVV-mandated (src/lib/evv-codes.ts). A note never absorbs this lane.",
    members: [
      {
        id: "evv-geofence",
        label: "EVV geofence-valid punch",
        sourceClauseId: "SOW §1.12",
        catalogKey: "evv_visit_verification",
        completionRoutes: ["SYSTEM"],
        condition: "evv_mandated_code",
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Per EVV-mandated visit. Do not invent UEVV integration success.",
  },
  evidence: evidence(
    "EVV is a separate requirement from the service note and the payroll timesheet. Mapping / state transmission is a publication gap.",
    ["SYSTEM"],
    "Geofence punch is the handling path, not equivalency for a narrative note.",
  ),
  completionRoutes: ["SYSTEM"],
  releaseGaps: [
    "needs EVV mapping review — do not invent UEVV / state integration success (Release_Gaps 1.12).",
  ],
  tests: tests("REQ-1.12", [
    ["positive", "SLN/SLH with a geofence-valid punch satisfy the EVV lane."],
    [
      "negative",
      "HHS/DSI/SEI are not EVV-mandated. A complete five-field note does not satisfy EVV.",
    ],
    [
      "boundary",
      "Unknown assignment is missing-information. Publication stays blocked on EVV mapping review.",
    ],
  ]),
});

export const REQ_1_10_SIGNATURE: DraftRule = draftBase({
  id: "REQ-1.10-signature",
  version: 1,
  title: "Staff attestation / signature — independent of the note fields",
  catalogKeys: ["timesheets_attendance"],
  source: linkWorkbookSource(["SOW §1.10(7)"]),
  predicates: [SIGN_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "signature-attested",
        label: "Staff attestation (signature) recorded",
        sourceClauseId: "SOW §1.10(7)",
        catalogKey: "timesheets_attendance",
        completionRoutes: ["IN_PLATFORM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Per documented service instance. Independent of note field completeness.",
  },
  evidence: evidence(
    "Attestation is a separate lane from the five-field note. Completing the note fields does not attest.",
    ["IN_PLATFORM"],
    "In-platform attestation is the handling path, not equivalency for a filled note form.",
  ),
  completionRoutes: ["IN_PLATFORM"],
  tests: tests("REQ-1.10-signature", [
    ["positive", "Recorded staff attestation satisfies the signature lane."],
    ["negative", "A complete note without attestation leaves the signature lane incomplete."],
    ["boundary", "Unknown assignment is missing-information."],
  ]),
});

export const REQ_ART2_BILLING: DraftRule = draftBase({
  id: "REQ-ART2",
  version: 1,
  title: "Article 2 general billing restrictions — evaluate on service date",
  catalogKeys: ["billing_service_match"],
  source: linkWorkbookSource(["SOW Article 2"]),
  predicates: [ART2_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Authorization, hospitalization, incarceration, overlapping services, exception approvals. Overlap is not automatically prohibited. Encoded exceptions only; otherwise review / missing-information. Draft simulation may raise review holds and must not silently reject claims while activation is locked.",
    members: [
      {
        id: "art2-authorization",
        label: "Active authorization (1056) on the service date",
        sourceClauseId: "SOW Article 2",
        catalogKey: "billing_service_match",
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "art2-hospitalization",
        label: "Hospitalization status known and reviewed",
        sourceClauseId: "SOW Article 2",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "art2-incarceration",
        label: "Incarceration status known and reviewed",
        sourceClauseId: "SOW Article 2",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "art2-overlap",
        label: "Overlapping services reviewed (encoded exceptions only)",
        sourceClauseId: "SOW Article 2",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "art2-exception",
        label: "Exception approvals applied only when encoded",
        sourceClauseId: "SOW Article 2",
        catalogKey: null,
        completionRoutes: ["UPLOAD", "SYSTEM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Judged on the service date. Do not invent a 1.32 transition date.",
  },
  evidence: evidence(
    "Evaluate each claim on the service date. Overlap is not an automatic denial. Unencoded pairs stay review / missing-information. Activation lock forbids silent claim rejection.",
    ["SYSTEM", "UPLOAD"],
    "Review hold with a claim-specific explanation and resolution link is the handling path, not a live claim block.",
  ),
  completionRoutes: ["SYSTEM", "UPLOAD"],
  tests: tests("REQ-ART2", [
    [
      "positive",
      "Active 1056, known not hospitalized/incarcerated, and only encoded overlap exceptions (back-to-back / segment / 2:1 with review) leave the claim eligible.",
    ],
    [
      "negative",
      "Missing authorization is a review hold. Unknown hospitalization or incarceration is missing-information, never an invented denial.",
    ],
    [
      "boundary",
      "Unencoded overlap is missing-information / review, not a prohibition. Locked activation never silently rejects the claim.",
    ],
  ]),
});

export const REQ_1_8_5_CPR_CURRENT: DraftRule = draftBase({
  id: "REQ-1.8.5-cpr-current",
  version: 1,
  title: "Current CPR on file — reuse target for the same subject",
  catalogKeys: ["cpr_first_aid_renewal"],
  source: linkWorkbookSource(["SOW §1.8(5)(B)"]),
  predicates: [{ kind: "direct_support_assignment", catalogKey: "cpr_first_aid_renewal" }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    members: [
      {
        id: "cpr",
        label: "Current CPR",
        sourceClauseId: "SOW §1.8(5)(B)",
        catalogKey: "cpr_first_aid_renewal",
        timing: CPR_TIMING,
        completionRoutes: ["UPLOAD"],
        evidenceMatch: { scope: "cpr" },
      },
    ],
  },
  timing: { kind: "certificate_expiry", certKey: "cpr" },
  evidence: evidence(
    "Same printed CPR credential may satisfy every CPR-linked requirement for this subject. No cross-tenant reuse. Upload is submitted until accepted.",
    ["UPLOAD"],
    "Upload of the official CPR card is the handling path; one accepted record may link to multiple CPR-scoped members.",
  ),
  completionRoutes: ["UPLOAD"],
  tests: tests("REQ-1.8.5-cpr-current", [
    [
      "positive",
      "One accepted CPR record covers this rule and REQ-1.8.5 CPR for the same subject.",
    ],
    ["negative", "A different tenant or a different subject cannot reuse the card."],
    [
      "boundary",
      "Submitted (not accepted) upload does not change compliance. Expired card does not.",
    ],
  ]),
});

export const STAGE1_RULE_IDS = [
  "REQ-1.8.4",
  "REQ-1.8.5",
  "REQ-1.8.7",
  "REQ-1.8.8",
  "REQ-30.6.b",
  "REQ-30.6.c",
] as const;

export const STAGE2_RULE_IDS = [
  "REQ-1.8.6",
  "REQ-30.5",
  "REQ-30.6.a",
  "REQ-32.5",
  "REQ-33.5.b-c",
  "REQ-1.25",
] as const;

export const STAGE3_RULE_IDS = [
  "REQ-1.10.7",
  "REQ-1.10.7-timesheet",
  "REQ-1.12",
  "REQ-1.10-signature",
  "REQ-ART2",
  "REQ-1.8.5-cpr-current",
] as const;

const PBA_PRED: DraftPredicate = {
  kind: "pba_assignment",
  catalogKey: "pba_financial_review",
};

const MONTHLY_PBA_TIMING: TimingAnchor = { kind: "calendar_period", cadence: "monthly" };
const QUARTERLY_PBA_TIMING: TimingAnchor = { kind: "calendar_period", cadence: "quarterly" };

export const REQ_ART15_PBA: DraftRule = draftBase({
  id: "REQ-15.3",
  version: 1,
  title: "Article 15 PBA funds — three distinct financial reviews",
  catalogKeys: ["pba_financial_review"],
  source: linkWorkbookSource(["SOW Article 15", "SOW §15.3", "SOW §1.28"]),
  predicates: [PBA_PRED],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Monthly review with the Person, monthly independent administrator review, and quarterly third-person sample. Reviewers must differ. One generic attestation does not satisfy all three. Link itemized statements / bank statements / distribution receipts.",
    members: [
      {
        id: "monthly-person-review",
        label: "Monthly review with the Person",
        sourceClauseId: "SOW §15.3",
        catalogKey: "pba_financial_review",
        timing: MONTHLY_PBA_TIMING,
        completionRoutes: ["IN_PLATFORM", "UPLOAD"],
        evidenceMatch: { scope: "pba_person_review" },
      },
      {
        id: "monthly-administrator-review",
        label: "Monthly independent administrator review",
        sourceClauseId: "SOW §15.3",
        catalogKey: "pba_financial_review",
        timing: MONTHLY_PBA_TIMING,
        completionRoutes: ["IN_PLATFORM", "UPLOAD"],
        evidenceMatch: { scope: "pba_administrator_review" },
      },
      {
        id: "quarterly-third-person-sample",
        label: "Quarterly third-person sample",
        sourceClauseId: "SOW Article 15",
        catalogKey: "pba_financial_review",
        timing: QUARTERLY_PBA_TIMING,
        completionRoutes: ["IN_PLATFORM", "UPLOAD"],
        evidenceMatch: { scope: "pba_third_person_sample" },
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Three source calendars only: monthly person, monthly administrator, quarterly third-person sample. Do not invent a sample percentage or extra interval.",
  },
  evidence: evidence(
    "Each review is a distinct accepted record with its own reviewer role and linked itemized financial evidence (statements, bank statements, distribution receipts). A generic attestation is not equivalency for the set.",
    ["IN_PLATFORM", "UPLOAD"],
    "Linked itemized evidence plus the matching reviewer is the handling path, not automatic equivalency across the three reviews.",
  ),
  completionRoutes: ["IN_PLATFORM", "UPLOAD"],
  tests: tests("REQ-15.3", [
    [
      "positive",
      "Distinct person / administrator / third-person reviewers with accepted itemized evidence in the matching monthly vs quarterly periods complete ALL three.",
    ],
    [
      "negative",
      "A wrong reviewer, a shared reviewer, or one generic attestation leaves the parent incomplete.",
    ],
    [
      "boundary",
      "Monthly period keys do not satisfy the quarterly sample. Unknown PBA assignment is missing-information.",
    ],
  ]),
});

export const REQ_REMINDERS: DraftRule = draftBase({
  id: "REQ-REMINDERS",
  version: 1,
  title: "Reminder / escalation offsets — product defaults, not SOW mandates",
  catalogKeys: [],
  source: linkWorkbookSource(["Workbook System_Design — Reminders (product defaults)"]),
  predicates: [{ kind: "product_default_reminder", catalogKey: null }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Configurable 30/14/7/1-day style defaults. Dedupe identical pending rows. Resolve on verified acceptance. Pending review reminds the reviewer, not a repeated staff upload.",
    members: [
      {
        id: "product-default-offsets",
        label: "Product-default reminder offsets (30/14/7/1)",
        sourceClauseId: "Workbook System_Design — Reminders (product defaults)",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "dedupe-pending",
        label: "Deduplicate identical pending reminders",
        sourceClauseId: "Workbook System_Design — Reminders (product defaults)",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "reviewer-not-staff-when-pending",
        label: "Pending review reminds the reviewer, not the uploading staff",
        sourceClauseId: "Workbook System_Design — Reminders (product defaults)",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Offsets are product defaults (30/14/7/1), not SOW-mandated intervals.",
  },
  evidence: evidence(
    "Reminder rows are product UX. Verified acceptance resolves them. They are not evidence of a SOW interval.",
    ["SYSTEM"],
    "Product-default offsets are a handling path, not equivalency for a legal deadline.",
  ),
  completionRoutes: ["SYSTEM"],
  releaseGaps: [
    "Reminder / escalation offsets are product defaults, not SOW mandates. Do not publish them as legal intervals.",
  ],
  tests: tests("REQ-REMINDERS", [
    ["positive", "Accepted evidence resolves pending product-default reminders."],
    [
      "negative",
      "Submitted evidence reminds the reviewer, not a second staff-upload nag. Duplicate events collapse.",
    ],
    [
      "boundary",
      "Offsets stay labeled product_default / isSowMandate false. Publication stays blocked.",
    ],
  ]),
});

export const REQ_OFFBOARD: DraftRule = draftBase({
  id: "REQ-OFFBOARD",
  version: 1,
  title: "Offboarding / change impact — recalculate and preserve evidence",
  catalogKeys: ["acre_sei"],
  source: linkWorkbookSource([
    "Workbook System_Design — Offboarding / change impact",
    "SOW §30.6(b)",
  ]),
  predicates: [{ kind: "change_impact", catalogKey: null }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Recalculate on role, assignment, client needs, credential, or supervisor change. Departing ACRE supervisor triggers reassignment review for SEI staff. Historical evidence is preserved.",
    members: [
      {
        id: "recalculate-on-change",
        label: "Recalculate applicable duties on encoded change triggers",
        sourceClauseId: "Workbook System_Design — Offboarding / change impact",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "acre-supervisor-reassignment",
        label: "Departing ACRE supervisor — SEI reassignment review",
        sourceClauseId: "SOW §30.6(b)",
        catalogKey: "acre_sei",
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "preserve-historical-evidence",
        label: "Preserve historical evidence on the file",
        sourceClauseId: "Workbook System_Design — Offboarding / change impact",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason: "Recalculate on encoded change triggers. No invented grace interval.",
  },
  evidence: evidence(
    "Change impact lists the duties to recalculate. Prior accepted records stay on the file. A departing ACRE supervisor does not erase SEI supervision history.",
    ["SYSTEM"],
    "Impact list is the handling path, not automatic completion of the new assignment.",
  ),
  completionRoutes: ["SYSTEM"],
  tests: tests("REQ-OFFBOARD", [
    [
      "positive",
      "Each encoded change trigger produces a recalculate impact and preserves historical evidence ids.",
    ],
    [
      "negative",
      "A departing ACRE supervisor on SEI staff adds a reassignment-review item. Non-SEI staff do not.",
    ],
    [
      "boundary",
      "Unchanged snapshots produce no impact. Simulation never deletes historical evidence.",
    ],
  ]),
});

export const REQ_AUDIT_EXPORT: DraftRule = draftBase({
  id: "REQ-AUDIT-EXPORT",
  version: 1,
  title: "Audit export packet — filtered fields, no invented retention",
  catalogKeys: [],
  source: linkWorkbookSource(["Workbook System_Design — Audit export"]),
  predicates: [{ kind: "audit_export", catalogKey: null }],
  group: {
    logic: "ALL",
    parentAssignment: "one",
    conditionNote:
      "Filtered packet: rule version, source clause, assignment, evidence, acceptance, timestamps, exceptions, amendments. Retention is from the applicable authority.",
    members: [
      {
        id: "filtered-packet-fields",
        label: "Filtered audit packet fields",
        sourceClauseId: "Workbook System_Design — Audit export",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
      {
        id: "retention-from-authority",
        label: "Retention from applicable authority (no invented universal period)",
        sourceClauseId: "Workbook System_Design — Audit export",
        catalogKey: null,
        completionRoutes: ["SYSTEM"],
      },
    ],
  },
  timing: {
    kind: "none",
    reason:
      "Export is on request. Retention is from the applicable authority — no invented universal period.",
  },
  evidence: evidence(
    "The packet lists encoded fields only. The retention field is 'from applicable authority' when no period is published.",
    ["SYSTEM"],
    "Filtered export is the handling path, not a claim that a universal retention interval exists.",
  ),
  completionRoutes: ["SYSTEM"],
  releaseGaps: [
    "Universal retention period is unknown / publication gap. Field stays 'from applicable authority'. Do not invent a default interval.",
  ],
  tests: tests("REQ-AUDIT-EXPORT", [
    [
      "positive",
      "Packet includes rule version, source clause, assignment, evidence, acceptance, timestamps, exceptions, and amendments.",
    ],
    ["negative", "Retention is not a fabricated universal period."],
    [
      "boundary",
      "Publication stays blocked while the applicable-authority retention gap is unresolved.",
    ],
  ]),
});

export const STAGE4_RULE_IDS = [
  "REQ-15.3",
  "REQ-REMINDERS",
  "REQ-OFFBOARD",
  "REQ-AUDIT-EXPORT",
] as const;

export const CORE_RULE_LOGIC_SLICE: readonly DraftRule[] = [
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_8_7_CE12,
  REQ_1_8_8_ABI,
  REQ_SEI_30_6_B,
  REQ_SEI_30_6_C,
  REQ_1_8_6_BEHAVIOR,
  REQ_30_5_SEI_BENEFITS,
  REQ_30_6_A_USOR,
  REQ_32_5_CAREGIVER,
  REQ_33_5_SJD,
  REQ_1_25_PERIODIC,
  REQ_1_10_7_NOTES,
  REQ_1_10_7_TIMESHEET,
  REQ_1_12_EVV,
  REQ_1_10_SIGNATURE,
  REQ_ART2_BILLING,
  REQ_1_8_5_CPR_CURRENT,
  REQ_ART15_PBA,
  REQ_REMINDERS,
  REQ_OFFBOARD,
  REQ_AUDIT_EXPORT,
];

export function draftRuleById(id: string): DraftRule | null {
  return CORE_RULE_LOGIC_SLICE.find((r) => r.id === id) ?? null;
}

export function allDraftRulesAreUnpublished(
  rules: readonly DraftRule[] = CORE_RULE_LOGIC_SLICE,
): boolean {
  return rules.every(
    (r) => r.lifecycle === "draft" && r.publication === "not_published" && r.approval === null,
  );
}
