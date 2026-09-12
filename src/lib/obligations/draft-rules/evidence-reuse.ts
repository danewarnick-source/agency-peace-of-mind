/**
 * Draft evidence reuse. One accepted record may satisfy several matching
 * requirements via evidence↔requirement links. Match subject, issuer, scope,
 * coverage, dates, and version. No cross-tenant reuse.
 * Upload → submitted. Only validated acceptance changes compliance.
 */

import type { EvidenceLifecycle, EvidenceMatchSpec } from "./types.ts";

export const EVIDENCE_LIFECYCLE_AFTER_UPLOAD: EvidenceLifecycle = "submitted";

export type ReusableEvidenceRecord = {
  id: string;
  organizationId: string;
  subjectId: string;
  issuer: string | null;
  scope: string;
  coverage: string[];
  issuedOn: string | null;
  expiresOn: string | null;
  version: string;
  lifecycle: EvidenceLifecycle;
};

export type EvidenceRequirementLink = {
  evidenceId: string;
  requirementId: string;
  memberId?: string;
  requiredScope?: string;
  requiredCoverage?: string[];
  requiredIssuer?: string | null;
};

export type EvidenceMatchContext = {
  organizationId: string;
  subjectId: string;
  asOf: string;
  requirementId: string;
  memberId?: string;
  match?: EvidenceMatchSpec;
};

export type EvidenceMatchResult = {
  evidenceId: string;
  requirementId: string;
  memberId?: string;
  matched: boolean;
  reason: string;
};

/** Upload always lands in submitted. It does not accept or expire the record. */
export function lifecycleAfterUpload(
  _current: EvidenceLifecycle | null | undefined,
): EvidenceLifecycle {
  return EVIDENCE_LIFECYCLE_AFTER_UPLOAD;
}

/** Only validated acceptance changes compliance. */
export function evidenceChangesCompliance(lifecycle: EvidenceLifecycle): boolean {
  return lifecycle === "accepted";
}

function dateCovers(asOf: string, issuedOn: string | null, expiresOn: string | null): boolean {
  if (issuedOn && asOf < issuedOn) return false;
  if (expiresOn && asOf > expiresOn) return false;
  return true;
}

function coverageIncludes(have: readonly string[], need: readonly string[]): boolean {
  if (need.length === 0) return true;
  const set = new Set(have.map((c) => c.trim().toUpperCase()));
  return need.every((c) => set.has(c.trim().toUpperCase()));
}

export function matchReusableEvidence(
  evidence: ReusableEvidenceRecord,
  ctx: EvidenceMatchContext,
): EvidenceMatchResult {
  const requirementId = ctx.requirementId;
  const memberId = ctx.memberId;
  const fail = (reason: string): EvidenceMatchResult => ({
    evidenceId: evidence.id,
    requirementId,
    memberId,
    matched: false,
    reason,
  });

  if (evidence.organizationId !== ctx.organizationId) {
    return fail("Cross-tenant evidence reuse is not allowed.");
  }
  if (evidence.subjectId !== ctx.subjectId) {
    return fail("Evidence subject does not match the requirement subject.");
  }
  if (!evidenceChangesCompliance(evidence.lifecycle)) {
    return fail(
      `Evidence lifecycle is ${evidence.lifecycle}; only accepted records change compliance.`,
    );
  }
  const wantScope = ctx.match?.scope;
  if (wantScope && evidence.scope.trim().toLowerCase() !== wantScope.trim().toLowerCase()) {
    return fail("Evidence scope does not match the requirement.");
  }
  if (ctx.match?.issuer && (evidence.issuer ?? "").trim() !== ctx.match.issuer.trim()) {
    return fail("Evidence issuer does not match the requirement.");
  }
  const needCoverage = ctx.match?.requiredCoverage ?? [];
  if (!coverageIncludes(evidence.coverage, needCoverage)) {
    return fail("Evidence topic coverage is insufficient for this requirement.");
  }
  if (!dateCovers(ctx.asOf, evidence.issuedOn, evidence.expiresOn)) {
    return fail("Evidence dates do not cover the as-of date.");
  }
  if (!evidence.version.trim()) {
    return fail("Evidence version is missing.");
  }
  return {
    evidenceId: evidence.id,
    requirementId,
    memberId,
    matched: true,
    reason: "Accepted evidence matches subject, issuer, scope, coverage, dates, and version.",
  };
}

export function firstMatchingEvidence(
  records: readonly ReusableEvidenceRecord[],
  ctx: EvidenceMatchContext,
): EvidenceMatchResult | null {
  let last: EvidenceMatchResult | null = null;
  for (const ev of records) {
    const result = matchReusableEvidence(ev, ctx);
    last = result;
    if (result.matched) return result;
  }
  return last;
}

/**
 * One accepted record may complete every linked requirement it matches.
 * Links that fail coverage/subject/org stay incomplete.
 */
export function applyEvidenceReuse(input: {
  records: readonly ReusableEvidenceRecord[];
  links: readonly EvidenceRequirementLink[];
  organizationId: string;
  subjectId: string;
  asOf: string;
}): EvidenceMatchResult[] {
  return input.links.map((link) => {
    const evidence = input.records.find((r) => r.id === link.evidenceId);
    if (!evidence) {
      return {
        evidenceId: link.evidenceId,
        requirementId: link.requirementId,
        memberId: link.memberId,
        matched: false,
        reason: "Evidence record is not in this simulation.",
      };
    }
    return matchReusableEvidence(evidence, {
      organizationId: input.organizationId,
      subjectId: input.subjectId,
      asOf: input.asOf,
      requirementId: link.requirementId,
      memberId: link.memberId,
      match: {
        scope: link.requiredScope ?? evidence.scope,
        requiredCoverage: link.requiredCoverage,
        issuer: link.requiredIssuer ?? undefined,
      },
    });
  });
}
