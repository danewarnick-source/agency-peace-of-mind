/**
 * First shared-behavior executable batch: assignment-gated §1.8
 * training / certification clocks.
 *
 * Overlays Core_Rule_Logic fixtures onto imported catalog parents so those
 * parents reuse the live company_obligations engine (assignments, evidence,
 * training, forms, reminders, admin review). Child elements stay on the
 * parent. Publication stays off until VERIFIED_PUBLICATIONS is filled
 * deliberately — this module does not publish.
 */

import { ABI_OBLIGATION_TITLE, THIRTY_DAY_OBLIGATION_TITLE } from "../in-hive-training.ts";
import { ANNUAL_CE_OBLIGATION_TITLE } from "../in-hive-training-annual-ce.ts";
import { PCT_HIRE_COURSE_TITLE } from "../client-form-obligations.ts";
import { HIRE_ALWAYS_TITLES, hireDueDaysForTitle } from "../obligation-auto-assign.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import { CPR_OBLIGATION_TITLES } from "../training-class.ts";
import { liveObligationKeyForRule, staffTaskPolicyForRule } from "./catalog-live-bridge.ts";
import { isBlocksSoloWhenLapsedKey } from "./solo-lapse.ts";
import {
  DIRECT_SUPPORT_HIRE_KEYS,
  ABI_DUTY_KEYS,
  BEHAVIOR_DUTY_KEYS,
  evaluateStaffDuty,
  staffReceivesDutyClock,
  type StaffDutyFacts,
} from "./duty-applicability.ts";
import { livePathQuestionByDutyKey } from "./setup-facts.ts";
import { PRODUCT_REMINDER_OFFSETS_DAYS } from "./draft-rules/reminders.ts";
import type { CatalogFact, LoadedDraftRule } from "./draft-rules/catalog-loader.ts";
import {
  REQ_1_8_4_ORIENTATION,
  REQ_1_8_5_CPR_CURRENT,
  REQ_1_8_5_FA_CPR_PCT,
  REQ_1_8_6_BEHAVIOR,
  REQ_1_8_7_CE12,
  REQ_1_8_8_ABI,
  draftRuleById,
} from "./draft-rules/fixtures.ts";
import { canActivate, canPublish } from "./draft-rules/publication.ts";
import { VERIFIED_PUBLICATIONS } from "./draft-rules/verified-publication.ts";
import type { DraftRule } from "./draft-rules/types.ts";

export const FIRST_EXECUTABLE_BATCH_ID = "hire_training_clocks" as const;

export const FIRST_EXECUTABLE_BATCH_RULE_IDS = [
  "REQ-1.8.4",
  "REQ-1.8.5",
  "REQ-1.8.6",
  "REQ-1.8.7",
  "REQ-1.8.8",
] as const;

export const FIRST_EXECUTABLE_BATCH_COMPANION_RULE_IDS = ["REQ-1.8.5-cpr-current"] as const;

export const FIRST_EXECUTABLE_BATCH_LIVE_KEYS = [
  "orientation_30_day",
  "cpr_first_aid_initial",
  "cpr_first_aid_renewal",
  "pct_hire_practices",
  "behavior_intervention_cert",
  "ce_12h_annual",
  "abi_training",
] as const;

export type FirstExecutableBatchRuleId = (typeof FIRST_EXECUTABLE_BATCH_RULE_IDS)[number];
export type FirstExecutableBatchLiveKey = (typeof FIRST_EXECUTABLE_BATCH_LIVE_KEYS)[number];

export type FirstBatchLiveFactKey =
  | "direct_support_assignment"
  | "abi_caseload"
  | "behavior_risk_assignment";

export type FirstBatchEngineBinding = {
  ruleId: string;
  liveKeys: readonly FirstExecutableBatchLiveKey[];
  parentAssignment: "one";
  mintsElementTasks: false;
  assignment: "hire_and_assignment_reeval" | "caseload_reeval";
  evidence: "in_hive_course" | "upload_cert" | "upload_hours";
  trainingTitle: string | null;
  formTitle: null;
  reminders: "product_default";
  adminReview: "in_hive_progress" | "cert_review" | "upload_review";
  blocksSoloWhenLapsed: boolean;
  liveFactKey: FirstBatchLiveFactKey;
};

const BATCH_FIXTURES: Readonly<Record<string, DraftRule>> = {
  "REQ-1.8.4": REQ_1_8_4_ORIENTATION,
  "REQ-1.8.5": REQ_1_8_5_FA_CPR_PCT,
  "REQ-1.8.6": REQ_1_8_6_BEHAVIOR,
  "REQ-1.8.7": REQ_1_8_7_CE12,
  "REQ-1.8.8": REQ_1_8_8_ABI,
  "REQ-1.8.5-cpr-current": REQ_1_8_5_CPR_CURRENT,
};

export const FIRST_BATCH_ENGINE_BINDINGS: readonly FirstBatchEngineBinding[] = [
  {
    ruleId: "REQ-1.8.4",
    liveKeys: ["orientation_30_day"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "hire_and_assignment_reeval",
    evidence: "in_hive_course",
    trainingTitle: THIRTY_DAY_OBLIGATION_TITLE,
    formTitle: null,
    reminders: "product_default",
    adminReview: "in_hive_progress",
    blocksSoloWhenLapsed: true,
    liveFactKey: "direct_support_assignment",
  },
  {
    ruleId: "REQ-1.8.5",
    liveKeys: ["cpr_first_aid_initial", "pct_hire_practices"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "hire_and_assignment_reeval",
    evidence: "upload_cert",
    trainingTitle: PCT_HIRE_COURSE_TITLE,
    formTitle: null,
    reminders: "product_default",
    adminReview: "cert_review",
    blocksSoloWhenLapsed: true,
    liveFactKey: "direct_support_assignment",
  },
  {
    ruleId: "REQ-1.8.5-cpr-current",
    liveKeys: ["cpr_first_aid_renewal"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "hire_and_assignment_reeval",
    evidence: "upload_cert",
    trainingTitle: null,
    formTitle: null,
    reminders: "product_default",
    adminReview: "cert_review",
    blocksSoloWhenLapsed: true,
    liveFactKey: "direct_support_assignment",
  },
  {
    ruleId: "REQ-1.8.6",
    liveKeys: ["behavior_intervention_cert"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "caseload_reeval",
    evidence: "upload_cert",
    trainingTitle: null,
    formTitle: null,
    reminders: "product_default",
    adminReview: "cert_review",
    blocksSoloWhenLapsed: true,
    liveFactKey: "behavior_risk_assignment",
  },
  {
    ruleId: "REQ-1.8.7",
    liveKeys: ["ce_12h_annual"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "hire_and_assignment_reeval",
    evidence: "upload_hours",
    trainingTitle: ANNUAL_CE_OBLIGATION_TITLE,
    formTitle: null,
    reminders: "product_default",
    adminReview: "upload_review",
    blocksSoloWhenLapsed: false,
    liveFactKey: "direct_support_assignment",
  },
  {
    ruleId: "REQ-1.8.8",
    liveKeys: ["abi_training"],
    parentAssignment: "one",
    mintsElementTasks: false,
    assignment: "caseload_reeval",
    evidence: "in_hive_course",
    trainingTitle: ABI_OBLIGATION_TITLE,
    formTitle: null,
    reminders: "product_default",
    adminReview: "in_hive_progress",
    blocksSoloWhenLapsed: true,
    liveFactKey: "abi_caseload",
  },
];

export function isFirstExecutableBatchRuleId(ruleId: string): boolean {
  return (FIRST_EXECUTABLE_BATCH_RULE_IDS as readonly string[]).includes(ruleId);
}

export function isFirstExecutableBatchLiveKey(key: string): boolean {
  return (FIRST_EXECUTABLE_BATCH_LIVE_KEYS as readonly string[]).includes(key);
}

export function firstBatchFixtureFor(ruleId: string): DraftRule | null {
  return BATCH_FIXTURES[ruleId] ?? draftRuleById(ruleId);
}

export function liveFactIdForKey(factKey: FirstBatchLiveFactKey): string {
  return `LIVE-${factKey}`;
}

const LIVE_FACT_QUESTIONS: Record<FirstBatchLiveFactKey, string> = {
  direct_support_assignment: "Which staff have a direct-support assignment?",
  abi_caseload: "Which persons have acquired brain injury, and which staff serve them?",
  behavior_risk_assignment:
    "Which persons are likely to engage in aggressive, self-injurious, or destructive behavior, and which staff serve them?",
};

export function firstBatchLiveFactsForRule(ruleId: string): CatalogFact[] {
  const binding = FIRST_BATCH_ENGINE_BINDINGS.find((row) => row.ruleId === ruleId);
  if (!binding) return [];
  const fromPath = binding.liveKeys
    .map((key) => livePathQuestionByDutyKey(key))
    .find((question) => question != null);
  return [
    {
      fact_id: liveFactIdForKey(binding.liveFactKey),
      question: fromPath?.question ?? LIVE_FACT_QUESTIONS[binding.liveFactKey],
    },
  ];
}

/**
 * Overlay fixture executable fields onto an imported catalog parent.
 * Keeps workbook identity (id, title, source, facts, publication flags).
 * Does not publish. Does not invent clauses.
 */
export function applyFirstExecutableBatchOverlay<T extends DraftRule>(rule: T): T {
  const fixture = firstBatchFixtureFor(rule.id);
  if (!fixture || !isFirstExecutableBatchRuleId(rule.id)) return rule;
  const existingFacts =
    "applicabilityFacts" in rule ? (rule as LoadedDraftRule).applicabilityFacts : undefined;
  return {
    ...rule,
    catalogKeys: fixture.catalogKeys,
    predicates: fixture.predicates,
    group: fixture.group,
    timing: fixture.timing,
    evidence: fixture.evidence,
    completionRoutes: fixture.completionRoutes,
    tests: fixture.tests,
    unresolvedAlternatives: [],
    unresolvedRenewals: [],
    ...(existingFacts
      ? {
          applicabilityFacts:
            existingFacts.length > 0 ? existingFacts : firstBatchLiveFactsForRule(rule.id),
        }
      : {}),
  };
}

export function applyFirstExecutableBatchOverlayAll<T extends DraftRule>(rules: readonly T[]): T[] {
  return rules.map((rule) => applyFirstExecutableBatchOverlay(rule));
}

export function firstExecutableBatchParents(
  parents: readonly LoadedDraftRule[],
): LoadedDraftRule[] {
  return parents
    .filter((rule) => isFirstExecutableBatchRuleId(rule.id))
    .map((rule) => applyFirstExecutableBatchOverlay(rule));
}

export function firstBatchBindingForRule(ruleId: string): FirstBatchEngineBinding | null {
  return FIRST_BATCH_ENGINE_BINDINGS.find((row) => row.ruleId === ruleId) ?? null;
}

export function firstBatchLiveEngineReady(binding: FirstBatchEngineBinding): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  for (const key of binding.liveKeys) {
    const entry = sowCatalogEntryByKey(key);
    if (!entry) reasons.push(`Missing live pack key ${key}.`);
    else if (entry.disposition !== "obligation") {
      reasons.push(`${key} is ${entry.disposition}, not an obligation clock.`);
    }
  }
  if (binding.parentAssignment !== "one") {
    reasons.push("Parent assignment must stay one — no per-element staff tasks.");
  }
  if (binding.mintsElementTasks) {
    reasons.push("Child elements must not mint staff tasks.");
  }
  if (binding.formTitle !== null) {
    reasons.push("This batch does not invent a person form.");
  }
  if (binding.reminders !== "product_default") {
    reasons.push("Reminders must reuse product-default offsets, not invented SOW intervals.");
  }
  if (PRODUCT_REMINDER_OFFSETS_DAYS.length === 0) {
    reasons.push("Product reminder offsets are missing.");
  }
  if (binding.blocksSoloWhenLapsed !== isBlocksSoloWhenLapsedKey(binding.liveKeys[0])) {
    reasons.push(`Solo-lapse wiring mismatch for ${binding.liveKeys[0]}.`);
  }
  return { ready: reasons.length === 0, reasons };
}

export function firstBatchAssignmentOpensClock(
  liveKey: FirstExecutableBatchLiveKey,
  staff: StaffDutyFacts,
): boolean {
  return staffReceivesDutyClock(evaluateStaffDuty({ dutyKey: liveKey, staff }));
}

export function firstBatchHireTitles(): readonly string[] {
  return [THIRTY_DAY_OBLIGATION_TITLE, CPR_OBLIGATION_TITLES[1], PCT_HIRE_COURSE_TITLE];
}

export function firstBatchHireDueDays(): Record<string, number> {
  return Object.fromEntries(
    firstBatchHireTitles().map((title) => [title, hireDueDaysForTitle(title)]),
  );
}

export function firstBatchIsOnHireAutoAssign(): boolean {
  return firstBatchHireTitles().every((title) =>
    (HIRE_ALWAYS_TITLES as readonly string[]).includes(title),
  );
}

export function firstBatchDutySetsIncludeLiveKeys(): boolean {
  const hire = new Set<string>(DIRECT_SUPPORT_HIRE_KEYS);
  const abi = new Set<string>(ABI_DUTY_KEYS);
  const behavior = new Set<string>(BEHAVIOR_DUTY_KEYS);
  return (
    hire.has("orientation_30_day") &&
    hire.has("cpr_first_aid_initial") &&
    hire.has("cpr_first_aid_renewal") &&
    hire.has("pct_hire_practices") &&
    hire.has("ce_12h_annual") &&
    abi.has("abi_training") &&
    behavior.has("behavior_intervention_cert")
  );
}

export function firstBatchPublicationStaysDeliberate(rule: DraftRule): boolean {
  if (VERIFIED_PUBLICATIONS.some((row) => row.ruleId === rule.id)) return false;
  return canPublish(rule) && !canActivate(rule) && rule.publication === "not_published";
}

export function firstBatchParentIsWired(rule: DraftRule): boolean {
  if (!isFirstExecutableBatchRuleId(rule.id)) return false;
  const overlaid = applyFirstExecutableBatchOverlay(rule);
  const liveKey = liveObligationKeyForRule(overlaid);
  if (!liveKey || !isFirstExecutableBatchLiveKey(liveKey)) return false;
  const policy = staffTaskPolicyForRule(overlaid);
  if (policy.role === "element") return false;
  if (overlaid.group.parentAssignment !== "one") return false;
  return canPublish(overlaid) && !canActivate(overlaid);
}
