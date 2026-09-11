/**
 * Certificate review — uploaded ≠ accepted.
 * AI may extract/suggest; verified rules decide. Never invent expiration
 * from the upload date.
 */

export type CertReviewStatus = "awaiting_review" | "accepted" | "correction_requested";

export type CertExtractedFields = {
  name: string | null;
  credential: string | null;
  completedOn: string | null;
  expiresOn: string | null;
};

export type CertReviewDecisionInput = {
  usesCertExpiration: boolean;
  extractedExpiresOn: string | null | undefined;
  confirmedExpiresOn: string | null | undefined;
  nectarStatus?: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string | null | undefined): value is string {
  return !!value && ISO_DAY.test(value);
}

/** Admin-confirmed or extracted printed expiration — never upload/completed_at. */
export function resolvedCertExpiration(input: CertReviewDecisionInput): string | null {
  if (isIsoDay(input.confirmedExpiresOn)) return input.confirmedExpiresOn;
  if (isIsoDay(input.extractedExpiresOn)) return input.extractedExpiresOn;
  return null;
}

export function expirationMissing(input: CertReviewDecisionInput): boolean {
  if (!input.usesCertExpiration) return false;
  return resolvedCertExpiration(input) === null;
}

export function canAcceptCertEvidence(input: CertReviewDecisionInput): boolean {
  if (expirationMissing(input)) return false;
  return true;
}

export function certReviewAcceptBlockReason(input: CertReviewDecisionInput): string | null {
  if (!expirationMissing(input)) return null;
  return "Confirm expiration before acceptance. Expiration was not detected on the upload.";
}

export function certReviewStatus(args: {
  nectarValidationStatus?: string | null;
  instanceStatus?: string | null;
  correctionRequested?: boolean;
}): CertReviewStatus {
  if (args.correctionRequested) return "correction_requested";
  if (args.nectarValidationStatus === "manually_confirmed") return "accepted";
  if (args.instanceStatus === "completed" || args.instanceStatus === "waived") {
    if (args.nectarValidationStatus === "failed") return "awaiting_review";
    return "accepted";
  }
  if (
    args.nectarValidationStatus === "failed" ||
    args.nectarValidationStatus === "needs_review" ||
    args.nectarValidationStatus === "passed"
  ) {
    return "awaiting_review";
  }
  return "awaiting_review";
}

export function certReviewStatusLabel(status: CertReviewStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "correction_requested") return "Correction requested";
  return "Awaiting review";
}

export function usesCertExpirationCadence(dueDayConfig: unknown): boolean {
  if (!dueDayConfig || typeof dueDayConfig !== "object") return false;
  const cfg = dueDayConfig as Record<string, unknown>;
  if (cfg.kind === "cert_expiration" || cfg.from === "cert_expiration") return true;
  // Live CPR/renewal rows often store every_n_months without kind — same as
  // dueRuleFromConfig's annually + every_n_months → cert_expiration mapping.
  if (cfg.every_n_months !== undefined && cfg.days_after_hire === undefined) return true;
  return false;
}

/** Guard: a due date must come from a printed/confirmed expiration, not upload time. */
export function renewalDueFromExpiration(
  expiresOn: string | null | undefined,
): string | null {
  return isIsoDay(expiresOn) ? expiresOn : null;
}

export const CERT_REVIEW_AI_NOTE =
  "AI extracted these details against the certificate. Verified rules decide. Never invent expiration from the upload date.";
