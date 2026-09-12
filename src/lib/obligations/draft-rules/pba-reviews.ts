/**
 * Article 15 / §15.3 / §1.28 PBA financial reviews (draft simulation).
 * Three distinct reviews: monthly with the Person, monthly administrator,
 * quarterly third-person sample. Reviewers must differ as the source
 * specifies. Link itemized statements / bank statements / distribution
 * receipts. One generic attestation does not satisfy all three.
 * No invented sample percentage or extra legal interval.
 */

import { evidenceChangesCompliance } from "./evidence-reuse.ts";
import type { EvidenceLifecycle } from "./types.ts";

export const PBA_REVIEW_KINDS = [
  "monthly_person",
  "monthly_administrator",
  "quarterly_third_person",
] as const;
export type PbaReviewKind = (typeof PBA_REVIEW_KINDS)[number];

export const PBA_REVIEWER_ROLES = ["person", "administrator", "third_person"] as const;
export type PbaReviewerRole = (typeof PBA_REVIEWER_ROLES)[number];

export const PBA_EVIDENCE_KINDS = [
  "itemized_financial_statement",
  "bank_statement",
  "distribution_receipt",
] as const;
export type PbaEvidenceKind = (typeof PBA_EVIDENCE_KINDS)[number];

export const PBA_REVIEW_SPECS = [
  {
    id: "monthly-person-review",
    kind: "monthly_person",
    cadence: "monthly",
    requiredReviewer: "person",
    sourceClauseId: "SOW §15.3",
    label: "Monthly review with the Person",
  },
  {
    id: "monthly-administrator-review",
    kind: "monthly_administrator",
    cadence: "monthly",
    requiredReviewer: "administrator",
    sourceClauseId: "SOW §15.3",
    label: "Monthly independent administrator review",
  },
  {
    id: "quarterly-third-person-sample",
    kind: "quarterly_third_person",
    cadence: "quarterly",
    requiredReviewer: "third_person",
    sourceClauseId: "SOW Article 15",
    label: "Quarterly third-person sample",
  },
] as const;

export type PbaReviewSpec = (typeof PBA_REVIEW_SPECS)[number];

export type LinkedPbaEvidence = {
  id: string;
  kind: PbaEvidenceKind;
};

export type SyntheticPbaReview = {
  reviewId: string;
  organizationId: string;
  clientId: string;
  accountId: string;
  /** Ledger owner / preparer. Cannot verify the quarterly third-person sample. */
  accountOwnerId: string | null;
  reviewKind: PbaReviewKind;
  periodKey: string;
  reviewerId: string;
  reviewerRole: PbaReviewerRole;
  linkedEvidence: LinkedPbaEvidence[];
  /** One undifferentiated attestation applied as if it covered every review. */
  genericAttestation?: boolean;
  attestationId?: string;
  lifecycle: EvidenceLifecycle;
};

export type PbaReviewIssueKind =
  | "wrong_reviewer"
  | "schedule_mismatch"
  | "generic_attestation"
  | "missing_itemized_evidence"
  | "reviewer_collision"
  | "lifecycle_not_accepted"
  | "missing_review";

export type PbaReviewIssue = {
  kind: PbaReviewIssueKind;
  memberId: string;
  reviewKind: PbaReviewKind;
  message: string;
};

export type SimulatedPbaReviewResult = {
  memberId: string;
  reviewKind: PbaReviewKind;
  cadence: "monthly" | "quarterly";
  expectedPeriodKey: string;
  complete: boolean;
  issues: PbaReviewIssue[];
};

export type SimulatedPbaAccountResult = {
  accountId: string;
  clientId: string;
  periodKeys: { monthly: string; quarterly: string };
  reviews: SimulatedPbaReviewResult[];
  allComplete: boolean;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function specForKind(kind: PbaReviewKind): PbaReviewSpec {
  const spec = PBA_REVIEW_SPECS.find((row) => row.kind === kind);
  if (!spec) throw new Error(`Unknown PBA review kind: ${kind}`);
  return spec;
}

export function specForMember(memberId: string): PbaReviewSpec | null {
  return PBA_REVIEW_SPECS.find((row) => row.id === memberId) ?? null;
}

/** Monthly = YYYY-MM. Quarterly = YYYY-Qn. Source cadences only. */
export function periodKeyForCadence(cadence: "monthly" | "quarterly", asOf: Date): string {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth() + 1;
  if (cadence === "monthly") return `${year}-${String(month).padStart(2, "0")}`;
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

export function reviewsAreScheduleSeparated(
  a: Pick<PbaReviewSpec, "cadence">,
  b: Pick<PbaReviewSpec, "cadence">,
  asOf: Date,
): boolean {
  if (a.cadence === b.cadence) return false;
  return periodKeyForCadence(a.cadence, asOf) !== periodKeyForCadence(b.cadence, asOf);
}

function hasItemizedEvidence(review: SyntheticPbaReview): boolean {
  return review.linkedEvidence.some((row) =>
    (PBA_EVIDENCE_KINDS as readonly string[]).includes(row.kind),
  );
}

function collidingReviewerIds(reviews: readonly SyntheticPbaReview[]): Set<string> {
  const byKind = new Map<PbaReviewKind, string>();
  const collisions = new Set<string>();
  for (const review of reviews) {
    const prior = byKind.get(review.reviewKind);
    if (prior && prior !== review.reviewerId) continue;
    byKind.set(review.reviewKind, review.reviewerId);
  }
  const ids = [...byKind.values()];
  for (const id of ids) {
    if (ids.filter((other) => other === id).length > 1) collisions.add(id);
  }
  return collisions;
}

function matchingReview(
  reviews: readonly SyntheticPbaReview[],
  spec: PbaReviewSpec,
  expectedPeriodKey: string,
): SyntheticPbaReview | undefined {
  return reviews.find((row) => row.reviewKind === spec.kind && row.periodKey === expectedPeriodKey);
}

export function evaluatePbaReviewForSpec(input: {
  spec: PbaReviewSpec;
  reviews: readonly SyntheticPbaReview[];
  asOf: Date;
  expectedPeriodKey?: string;
}): SimulatedPbaReviewResult {
  const expectedPeriodKey =
    input.expectedPeriodKey ?? periodKeyForCadence(input.spec.cadence, input.asOf);
  const issues: PbaReviewIssue[] = [];
  const review = matchingReview(input.reviews, input.spec, expectedPeriodKey);

  if (!review) {
    issues.push({
      kind: "missing_review",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} for ${expectedPeriodKey} is missing.`,
    });
    return {
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      cadence: input.spec.cadence,
      expectedPeriodKey,
      complete: false,
      issues,
    };
  }

  if (review.periodKey !== expectedPeriodKey) {
    issues.push({
      kind: "schedule_mismatch",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} period ${review.periodKey} does not match ${expectedPeriodKey}. Monthly and quarterly calendars stay separate.`,
    });
  }

  if (review.reviewerRole !== input.spec.requiredReviewer) {
    issues.push({
      kind: "wrong_reviewer",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} requires reviewer role ${input.spec.requiredReviewer}; got ${review.reviewerRole}.`,
    });
  }

  if (input.spec.kind === "quarterly_third_person") {
    if (review.accountOwnerId && review.reviewerId === review.accountOwnerId) {
      issues.push({
        kind: "wrong_reviewer",
        memberId: input.spec.id,
        reviewKind: input.spec.kind,
        message: "Quarterly third-person sample cannot be verified by the original account owner.",
      });
    }
  }

  const collisions = collidingReviewerIds(input.reviews);
  if (collisions.has(review.reviewerId) && input.reviews.length > 1) {
    issues.push({
      kind: "reviewer_collision",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} reviewer also appears on a different PBA review. Reviewers must differ.`,
    });
  }

  if (review.genericAttestation === true) {
    issues.push({
      kind: "generic_attestation",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: "A generic attestation does not satisfy this PBA review.",
    });
  }

  const attestationIds = input.reviews
    .map((row) => row.attestationId)
    .filter((id): id is string => !!id);
  if (
    review.attestationId &&
    attestationIds.filter((id) => id === review.attestationId).length >= 3
  ) {
    issues.push({
      kind: "generic_attestation",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message:
        "One attestation cannot satisfy monthly person, monthly administrator, and quarterly third-person reviews.",
    });
  }

  if (!hasItemizedEvidence(review)) {
    issues.push({
      kind: "missing_itemized_evidence",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} must link itemized financial statements, bank statements, or distribution receipts.`,
    });
  }

  if (!evidenceChangesCompliance(review.lifecycle)) {
    issues.push({
      kind: "lifecycle_not_accepted",
      memberId: input.spec.id,
      reviewKind: input.spec.kind,
      message: `${input.spec.label} is ${review.lifecycle}; only accepted reviews change compliance.`,
    });
  }

  return {
    memberId: input.spec.id,
    reviewKind: input.spec.kind,
    cadence: input.spec.cadence,
    expectedPeriodKey,
    complete: issues.length === 0,
    issues,
  };
}

export function evaluatePbaAccount(input: {
  organizationId: string;
  clientId: string;
  accountId: string;
  reviews: readonly SyntheticPbaReview[];
  asOf: Date;
}): SimulatedPbaAccountResult {
  const scoped = input.reviews.filter(
    (row) =>
      row.organizationId === input.organizationId &&
      row.accountId === input.accountId &&
      row.clientId === input.clientId,
  );
  const monthly = periodKeyForCadence("monthly", input.asOf);
  const quarterly = periodKeyForCadence("quarterly", input.asOf);
  const reviews = PBA_REVIEW_SPECS.map((spec) =>
    evaluatePbaReviewForSpec({
      spec,
      reviews: scoped,
      asOf: input.asOf,
      expectedPeriodKey: spec.cadence === "monthly" ? monthly : quarterly,
    }),
  );
  return {
    accountId: input.accountId,
    clientId: input.clientId,
    periodKeys: { monthly, quarterly },
    reviews,
    allComplete: reviews.every((row) => row.complete),
  };
}

export function evaluatePbaReviews(input: {
  organizationId: string;
  reviews: readonly SyntheticPbaReview[];
  asOf: Date;
}): SimulatedPbaAccountResult[] {
  const accounts = new Map<string, { clientId: string; accountId: string }>();
  for (const review of input.reviews) {
    if (review.organizationId !== input.organizationId) continue;
    accounts.set(review.accountId, { clientId: review.clientId, accountId: review.accountId });
  }
  return [...accounts.values()].map((account) =>
    evaluatePbaAccount({
      organizationId: input.organizationId,
      clientId: account.clientId,
      accountId: account.accountId,
      reviews: input.reviews,
      asOf: input.asOf,
    }),
  );
}

/** True when the as-of day is a valid ISO date used to pick period keys. */
export function isIsoDay(value: string): boolean {
  return ISO_DAY.test(value);
}
