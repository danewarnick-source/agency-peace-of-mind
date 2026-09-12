/**
 * Article 2 general billing restrictions (draft simulation).
 * Evaluate the claim/service against rules effective on the service date.
 * Overlap is never an automatic prohibition. Encoded exceptions only.
 * Otherwise missing-information / review — never an invented denial.
 * Activation lock: review holds only; never silently reject the claim.
 */

import type { HoldClearPath } from "../../dspd-entry-readiness.ts";
import { clearPathForHold, type AuthFact } from "../../dspd-entry-readiness.ts";
import { STAGE1_ACTIVATION_LOCKED } from "./types.ts";

export const BILLING_RESTRICTION_KINDS = [
  "authorization",
  "hospitalization",
  "incarceration",
  "overlapping_services",
  "exception_approval",
] as const;
export type BillingRestrictionKind = (typeof BILLING_RESTRICTION_KINDS)[number];

export const ENCODED_OVERLAP_EXCEPTIONS = [
  "back_to_back",
  "segment_within_parent",
  "two_to_one_rights_mod",
] as const;
export type EncodedOverlapException = (typeof ENCODED_OVERLAP_EXCEPTIONS)[number];

/** Reuses the #324 hold shape (kind / reason / gap / requirementId / clear / lane). */
export type SimulatedClaimHold = {
  kind: BillingRestrictionKind;
  reason: string;
  gap: string;
  requirementId: string | null;
  clear: HoldClearPath;
  lane: "billing";
  /** Review only. Never a silent reject while activation is locked. */
  outcome: "review_hold" | "missing_information";
};

export type OverlapFact = {
  otherServiceCode: string;
  thisStart: string;
  thisEnd: string;
  otherStart: string;
  otherEnd: string;
  parentShiftId?: string | null;
  otherId?: string | null;
  otherParentShiftId?: string | null;
  sameClient: boolean;
  sameStaff: boolean;
  /** Two staff, one client, same window — encoded as a rights-mod warning, not a denial. */
  twoToOne?: boolean;
};

export type ExceptionApprovalFact = {
  kind: EncodedOverlapException | string;
  approved: boolean;
};

export type SyntheticClaim = {
  claimId: string;
  organizationId: string;
  clientId: string;
  staffId: string;
  serviceCode: string;
  serviceDate: string;
  authorization?: AuthFact | null;
  hospitalized?: boolean | null;
  incarcerated?: boolean | null;
  overlaps?: OverlapFact[];
  exceptionApprovals?: ExceptionApprovalFact[];
};

export type SimulatedClaimResult = {
  claimId: string;
  serviceCode: string;
  serviceDate: string;
  eligibility: "eligible" | "review_hold" | "missing_information";
  /** Always false while Stage activation is locked. */
  rejected: false;
  createdClaimBlock: false;
  holds: SimulatedClaimHold[];
};

function hold(
  kind: BillingRestrictionKind,
  reason: string,
  gap: string,
  outcome: SimulatedClaimHold["outcome"],
  ctx: { clientId?: string; staffId?: string },
  requirementId: string | null = "REQ-ART2",
): SimulatedClaimHold {
  const mapped =
    kind === "authorization"
      ? "authorization"
      : kind === "overlapping_services"
        ? "incompatible_codes"
        : "authorization";
  return {
    kind,
    reason,
    gap,
    requirementId,
    clear: clearPathForHold(mapped, ctx),
    lane: "billing",
    outcome,
  };
}

function parseIso(value: string): number | null {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Authorization window judged on the service date — not today's clock. */
export function authorizationActiveOnServiceDate(
  auth: AuthFact | null | undefined,
  serviceDate: string,
): boolean {
  if (!auth) return false;
  if (auth.authorizationPending) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return false;
  const start = auth.serviceStartDate;
  const end = auth.serviceEndDate;
  if (start && serviceDate < start) return false;
  if (end && serviceDate > end) return false;
  return true;
}

/**
 * Encoded overlap exceptions only. Anything else is not a denial.
 * back-to-back (end == next start) and segment-within-parent are not conflicts.
 * 2:1 is a rights-modification warning, not a prohibition.
 */
export function encodedOverlapException(overlap: OverlapFact): EncodedOverlapException | null {
  if (overlap.twoToOne && overlap.sameClient && !overlap.sameStaff) {
    return "two_to_one_rights_mod";
  }
  if (
    overlap.parentShiftId &&
    (overlap.otherId === overlap.parentShiftId ||
      overlap.otherParentShiftId === overlap.parentShiftId)
  ) {
    return "segment_within_parent";
  }
  const aEnd = parseIso(overlap.thisEnd);
  const bStart = parseIso(overlap.otherStart);
  const aStart = parseIso(overlap.thisStart);
  const bEnd = parseIso(overlap.otherEnd);
  if (aEnd != null && bStart != null && aEnd === bStart) return "back_to_back";
  if (aStart != null && bEnd != null && bEnd === aStart) return "back_to_back";
  return null;
}

function windowsOverlap(overlap: OverlapFact): boolean | null {
  const aStart = parseIso(overlap.thisStart);
  const aEnd = parseIso(overlap.thisEnd);
  const bStart = parseIso(overlap.otherStart);
  const bEnd = parseIso(overlap.otherEnd);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return null;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Evaluate one claim against Article 2 dimensions effective on the service date.
 * Locked activation never rejects or writes a live claim block.
 */
export function evaluateClaimRestrictions(claim: SyntheticClaim): SimulatedClaimResult {
  const ctx = { clientId: claim.clientId, staffId: claim.staffId };
  const holds: SimulatedClaimHold[] = [];

  if (claim.authorization === undefined) {
    holds.push(
      hold(
        "authorization",
        "Authorization status for this service date is unanswered.",
        "1056 / authorization fact missing",
        "missing_information",
        ctx,
      ),
    );
  } else if (!authorizationActiveOnServiceDate(claim.authorization, claim.serviceDate)) {
    holds.push(
      hold(
        "authorization",
        "No active authorization (1056) for this service code on the service date.",
        claim.serviceCode
          ? `Missing or inactive ${claim.serviceCode} authorization`
          : "Missing or inactive authorization",
        "review_hold",
        ctx,
      ),
    );
  }

  if (claim.hospitalized == null) {
    holds.push(
      hold(
        "hospitalization",
        "Hospitalization on the service date is unanswered — review, never an invented denial.",
        "Hospitalization fact missing",
        "missing_information",
        ctx,
      ),
    );
  } else if (claim.hospitalized) {
    holds.push(
      hold(
        "hospitalization",
        "Person was hospitalized on the service date — review hold. No invented unbillable-day rule beyond encoded HHS/RHS artifacts.",
        "Hospitalization recorded",
        "review_hold",
        ctx,
      ),
    );
  }

  if (claim.incarcerated == null) {
    holds.push(
      hold(
        "incarceration",
        "Incarceration on the service date is unanswered — review, never an invented denial.",
        "Incarceration fact missing",
        "missing_information",
        ctx,
      ),
    );
  } else if (claim.incarcerated) {
    holds.push(
      hold(
        "incarceration",
        "Incarceration on the service date — review hold. No invented automatic denial.",
        "Incarceration recorded",
        "review_hold",
        ctx,
      ),
    );
  }

  const overlaps = claim.overlaps ?? [];
  for (const overlap of overlaps) {
    const actual = windowsOverlap(overlap);
    if (actual === null) {
      holds.push(
        hold(
          "overlapping_services",
          "Overlap window cannot be resolved — missing-information, not a denial.",
          `${claim.serviceCode} / ${overlap.otherServiceCode} timestamps unanswered`,
          "missing_information",
          ctx,
        ),
      );
      continue;
    }
    if (!actual) continue;
    const encoded = encodedOverlapException(overlap);
    if (encoded === "back_to_back" || encoded === "segment_within_parent") {
      continue;
    }
    if (encoded === "two_to_one_rights_mod") {
      const approved = (claim.exceptionApprovals ?? []).some(
        (a) => a.kind === "two_to_one_rights_mod" && a.approved,
      );
      if (!approved) {
        holds.push(
          hold(
            "exception_approval",
            "2:1 staffing on the same client/time needs a rights-modification review — warning, not an invented prohibition.",
            `${claim.serviceCode} + second staff (2:1)`,
            "review_hold",
            ctx,
          ),
        );
      }
      continue;
    }
    holds.push(
      hold(
        "overlapping_services",
        "Overlap is not automatically prohibited. No encoded service-specific exception for this pair — review / missing-information, never an invented denial.",
        `${claim.serviceCode} overlaps ${overlap.otherServiceCode}`,
        "missing_information",
        ctx,
      ),
    );
  }

  const locked = STAGE1_ACTIVATION_LOCKED;
  const hasMissing = holds.some((h) => h.outcome === "missing_information");
  const hasReview = holds.some((h) => h.outcome === "review_hold");
  const eligibility: SimulatedClaimResult["eligibility"] =
    holds.length === 0 ? "eligible" : hasMissing ? "missing_information" : "review_hold";

  return {
    claimId: claim.claimId,
    serviceCode: claim.serviceCode,
    serviceDate: claim.serviceDate,
    eligibility:
      locked && hasReview && !hasMissing && holds.length > 0 ? "review_hold" : eligibility,
    rejected: false,
    createdClaimBlock: false,
    holds,
  };
}

export function claimsNeverSilentlyRejected(results: readonly SimulatedClaimResult[]): boolean {
  if (!STAGE1_ACTIVATION_LOCKED) return results.every((r) => r.rejected === false);
  return results.every((r) => r.rejected === false && r.createdClaimBlock === false);
}
