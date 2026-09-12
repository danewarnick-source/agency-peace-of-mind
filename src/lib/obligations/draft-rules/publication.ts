/**
 * Workbook publication gate (System_Design §Publication).
 * Schema/simulation first. A published rule needs predicates, groups, timing,
 * evidence, source, and positive/negative/boundary tests. Unresolved
 * renewal/alternative blocks activation. Stage 1 lock never activates.
 */

import { STAGE1_ACTIVATION_LOCKED, type DraftRule, type RuleTestKind } from "./types.ts";
import { sourceIndexGrantsPublication } from "./source.ts";

export const PUBLICATION_GAP_KEYS = [
  "predicates",
  "group_logic",
  "timing",
  "evidence_acceptance",
  "source_link",
  "positive_test",
  "negative_test",
  "boundary_test",
  "unresolved_alternatives",
  "unresolved_renewals",
  "release_gaps",
  "lifecycle_not_reviewed",
  "missing_approval",
  "not_published_flag",
  "source_index_is_not_permission",
  "stage1_lock",
] as const;

export type PublicationGapKey = (typeof PUBLICATION_GAP_KEYS)[number];

export type PublicationGap = {
  key: PublicationGapKey;
  reason: string;
};

function hasTest(rule: DraftRule, kind: RuleTestKind): boolean {
  return rule.tests.some((t) => t.kind === kind && t.assert.trim().length > 0);
}

function timingPresent(rule: DraftRule): boolean {
  if (!rule.timing) return false;
  if (rule.timing.kind === "none") return rule.timing.reason.trim().length > 0;
  if (rule.timing.kind === "hire_plus_days") return Number.isFinite(rule.timing.days);
  if (rule.timing.kind === "employment_year") return rule.timing.startYear >= 1;
  if (rule.timing.kind === "certificate_expiry") return rule.timing.certKey.trim().length > 0;
  if (rule.timing.kind === "usor_cohort") {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(rule.timing.cutover) &&
      /^\d{4}-\d{2}-\d{2}$/.test(rule.timing.existingDeadline) &&
      Number.isFinite(rule.timing.awardPlusMonths) &&
      rule.timing.awardPlusMonths >= 1
    );
  }
  if (rule.timing.kind === "calendar_period") {
    return rule.timing.cadence === "monthly" || rule.timing.cadence === "quarterly";
  }
  return false;
}

function evidencePresent(rule: DraftRule): boolean {
  return (
    rule.evidence.summary.trim().length > 0 &&
    rule.evidence.routes.length > 0 &&
    rule.evidence.defaultHandlingLabel.trim().length > 0 &&
    rule.evidence.automaticEquivalency === false
  );
}

function sourcePresent(rule: DraftRule): boolean {
  return (
    rule.source.sourceId.trim().length > 0 &&
    rule.source.sourceVersion.trim().length > 0 &&
    rule.source.sourceHash.trim().length > 0 &&
    rule.source.clauseIds.length > 0
  );
}

function groupPresent(rule: DraftRule): boolean {
  const hasMembers = rule.group.members.length > 0;
  const hasRoutes = (rule.group.routes?.length ?? 0) > 0;
  const routesOk =
    !hasRoutes ||
    rule.group.routes!.every(
      (route) => route.conditions.length > 0 && route.officialProgram.trim().length > 0,
    );
  return (
    (rule.group.logic === "ALL" ||
      rule.group.logic === "ANY" ||
      rule.group.logic === "CONDITIONAL") &&
    (hasMembers || hasRoutes) &&
    routesOk &&
    (rule.group.parentAssignment === "one" || rule.group.parentAssignment === "per_member")
  );
}

/** Structural + unresolved gaps. Does not grant activation. */
export function structuralPublicationGaps(rule: DraftRule): PublicationGap[] {
  const gaps: PublicationGap[] = [];
  if (rule.predicates.length === 0) {
    gaps.push({ key: "predicates", reason: "Rule has no applicability predicates." });
  }
  if (!groupPresent(rule)) {
    gaps.push({
      key: "group_logic",
      reason: "Rule is missing ALL/ANY/conditional group members.",
    });
  }
  if (!timingPresent(rule)) {
    gaps.push({
      key: "timing",
      reason: "Rule is missing an explicit timing anchor (or an explicit none).",
    });
  }
  if (!evidencePresent(rule)) {
    gaps.push({
      key: "evidence_acceptance",
      reason: "Rule is missing evidence acceptance (routes + handling label, no auto-equivalency).",
    });
  }
  if (!sourcePresent(rule)) {
    gaps.push({
      key: "source_link",
      reason: "Rule is missing an immutable source version/hash and clause ids.",
    });
  }
  if (!hasTest(rule, "positive")) {
    gaps.push({ key: "positive_test", reason: "Rule is missing a positive test." });
  }
  if (!hasTest(rule, "negative")) {
    gaps.push({ key: "negative_test", reason: "Rule is missing a negative test." });
  }
  if (!hasTest(rule, "boundary")) {
    gaps.push({ key: "boundary_test", reason: "Rule is missing a boundary test." });
  }
  if (rule.unresolvedAlternatives.length > 0) {
    gaps.push({
      key: "unresolved_alternatives",
      reason: `Unresolved alternatives: ${rule.unresolvedAlternatives.join("; ")}`,
    });
  }
  if (rule.unresolvedRenewals.length > 0) {
    gaps.push({
      key: "unresolved_renewals",
      reason: `Unresolved renewals: ${rule.unresolvedRenewals.join("; ")}`,
    });
  }
  if (rule.releaseGaps.length > 0) {
    gaps.push({
      key: "release_gaps",
      reason: `Release_Gaps (do not invent a fix): ${rule.releaseGaps.join("; ")}`,
    });
  }
  return gaps;
}

export function activationBlockReasons(rule: DraftRule): PublicationGap[] {
  const gaps = [...structuralPublicationGaps(rule)];
  if (rule.lifecycle !== "reviewed" && rule.lifecycle !== "published") {
    gaps.push({
      key: "lifecycle_not_reviewed",
      reason: `Lifecycle is ${rule.lifecycle}; publication needs reviewed (or published) plus approval.`,
    });
  }
  if (!rule.approval) {
    gaps.push({
      key: "missing_approval",
      reason: "Publication needs an explicit approval actor and date.",
    });
  }
  if (rule.publication !== "published") {
    gaps.push({
      key: "not_published_flag",
      reason: "Publication flag is not_published.",
    });
  }
  if (sourceIndexGrantsPublication(rule.sourceIndex)) {
    gaps.push({
      key: "source_index_is_not_permission",
      reason: "Source_index label is archive metadata, not publication permission.",
    });
  }
  if (STAGE1_ACTIVATION_LOCKED) {
    gaps.push({
      key: "stage1_lock",
      reason: "Stage 1 lock — draft rules are not activated on any tenant.",
    });
  }
  return gaps;
}

export function publicationGaps(rule: DraftRule): PublicationGap[] {
  return activationBlockReasons(rule);
}

/**
 * Structural publishability: predicates, group, timing, evidence, source,
 * tests, and no unresolved alternatives/renewals. Does not activate.
 */
export function canPublish(rule: DraftRule): boolean {
  return structuralPublicationGaps(rule).length === 0;
}

/** Live activation. Stage 1 always false. */
export function canActivate(rule: DraftRule): boolean {
  if (STAGE1_ACTIVATION_LOCKED) return false;
  if (rule.lifecycle !== "published") return false;
  if (rule.publication !== "published") return false;
  if (!rule.approval) return false;
  if (sourceIndexGrantsPublication(rule.sourceIndex)) return false;
  return canPublish(rule);
}

export function draftRuleAdminRow(rule: DraftRule): {
  id: string;
  title: string;
  lifecycle: DraftRule["lifecycle"];
  publication: DraftRule["publication"];
  canPublish: boolean;
  canActivate: boolean;
  gaps: PublicationGap[];
  clauseIds: string[];
} {
  return {
    id: rule.id,
    title: rule.title,
    lifecycle: rule.lifecycle,
    publication: rule.publication,
    canPublish: canPublish(rule),
    canActivate: canActivate(rule),
    gaps: publicationGaps(rule),
    clauseIds: rule.source.clauseIds,
  };
}
