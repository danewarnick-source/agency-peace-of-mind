/**
 * Core_Rule_Logic slice — Stage 1 draft fixtures only.
 * Every imported rule is draft / not_published. Source_index is archive
 * metadata. Clause ids come from the workbook / encoded SOW articles already
 * cited on the live pack. No invented renewal intervals.
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
  > & {
    unresolvedAlternatives?: string[];
    unresolvedRenewals?: string[];
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

export const CORE_RULE_LOGIC_SLICE: readonly DraftRule[] = [
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_8_7_CE12,
  REQ_1_8_8_ABI,
  REQ_SEI_30_6_B,
  REQ_SEI_30_6_C,
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
