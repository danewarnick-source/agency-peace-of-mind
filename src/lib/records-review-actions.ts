/**
 * Records review button → DB mapping.
 * Exact actions per exception; writes reuse the existing compliance-desk /
 * records columns. Do not invent a parallel desk.
 *
 *   Ask     → shift thread + question (Soft tables; see threads.ts)
 *   Approve → evv_timesheets.status='Approved' + review_status='approved'
 *             (reviewApprove / approve on dashboard.compliance-desk)
 *   Trim    → corrected_clock_out + rounded_clock_out via saveRecordFields
 *             (never rewrite raw clock_* timestamps)
 *   Accept  → reconciliation_status='accepted' + attestation payload
 *             (ReviewReconciliationDialog)
 *   Flag    → incident_flag=true + reconciliation_status='flagged'
 */
import { roundToQuarterHourISO } from "./time-rounding.ts";
import type { ReviewExceptionCode } from "./records-review-rules.ts";

export const REVIEW_ACTIONS = ["ask", "approve", "trim", "accept", "flag"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  ask: "Ask",
  approve: "Approve",
  trim: "Trim",
  accept: "Accept",
  flag: "Flag",
};

/** Buttons shown for each exception — locked to the existing desk effects. */
export const ACTIONS_BY_EXCEPTION: Record<ReviewExceptionCode, readonly ReviewAction[]> = {
  out_of_geofence: ["ask", "accept", "flag"],
  missing_note: ["ask", "approve", "flag"],
  no_clockout_stale: ["ask", "trim", "flag"],
  late_clock_out: ["ask", "trim", "approve"],
};

export function actionsForExceptions(
  codes: readonly ReviewExceptionCode[],
): ReviewAction[] {
  const set = new Set<ReviewAction>();
  for (const code of codes) {
    const listed = ACTIONS_BY_EXCEPTION[code];
    if (!listed) continue;
    for (const action of listed) set.add(action);
  }
  return REVIEW_ACTIONS.filter((action) => set.has(action));
}

export type ApprovePatch = {
  status: "Approved";
  review_status: "approved";
  reviewed_by: string | null;
  reviewed_at: string;
  review_note: string | null;
};

export function approveTimesheetPatch(input: {
  reviewerId: string | null;
  note?: string | null;
  now?: Date;
}): ApprovePatch {
  const note = (input.note ?? "").trim();
  return {
    status: "Approved",
    review_status: "approved",
    reviewed_by: input.reviewerId,
    reviewed_at: (input.now ?? new Date()).toISOString(),
    review_note: note.length > 0 ? note : null,
  };
}

export type TrimPatch = {
  corrected_clock_out: string;
  rounded_clock_out: string;
};

/**
 * Trim writes corrected/rounded clock-out only. Raw clock_out_timestamp
 * stays untouched (billing-units / CLAUDE.md).
 */
export function trimClockOutPatch(input: {
  clockInIso: string;
  trimToIso?: string | null;
  now?: Date;
}): TrimPatch {
  const clockIn = new Date(input.clockInIso);
  const fallback = Number.isFinite(clockIn.getTime())
    ? new Date(clockIn.getTime() + 8 * 36e5)
    : (input.now ?? new Date());
  const chosen = input.trimToIso ? new Date(input.trimToIso) : fallback;
  const iso = Number.isFinite(chosen.getTime())
    ? chosen.toISOString()
    : fallback.toISOString();
  return {
    corrected_clock_out: iso,
    rounded_clock_out: roundToQuarterHourISO(iso),
  };
}

export const ACCEPT_ATTESTATION_TEXT =
  "I attest that the service was validly delivered away from the approved address (community, transport, or appointment) and that this visit remains billable.";

export type AcceptPatch = {
  reconciliation_status: "accepted";
  reconciliation_attestation: string;
  reconciliation_review_notes: string | null;
  reconciliation_reviewed_by: string;
  reconciliation_reviewed_at: string;
};

export function acceptGeofencePatch(input: {
  reviewerName: string;
  signedName: string;
  signedTitle: string;
  notes?: string | null;
  now?: Date;
}): AcceptPatch {
  const signedName = input.signedName.trim();
  const signedTitle = input.signedTitle.trim();
  if (signedName.length < 2 || signedTitle.length < 2) {
    throw new Error("Signed name and title are required to accept.");
  }
  const now = (input.now ?? new Date()).toISOString();
  return {
    reconciliation_status: "accepted",
    reconciliation_attestation: JSON.stringify({
      signed_name: signedName,
      signed_title: signedTitle,
      attestation_text: ACCEPT_ATTESTATION_TEXT,
      signed_at: now,
    }),
    reconciliation_review_notes: (input.notes ?? "").trim() || null,
    reconciliation_reviewed_by: input.reviewerName,
    reconciliation_reviewed_at: now,
  };
}

export type FlagPatch = {
  incident_flag: true;
  reconciliation_status: "flagged";
  reconciliation_review_notes: string | null;
  reconciliation_reviewed_by: string;
  reconciliation_reviewed_at: string;
};

export function flagTimesheetPatch(input: {
  reviewerName: string;
  notes?: string | null;
  now?: Date;
}): FlagPatch {
  return {
    incident_flag: true,
    reconciliation_status: "flagged",
    reconciliation_review_notes: (input.notes ?? "").trim() || null,
    reconciliation_reviewed_by: input.reviewerName,
    reconciliation_reviewed_at: (input.now ?? new Date()).toISOString(),
  };
}

export function isReviewAction(value: string | null | undefined): value is ReviewAction {
  return (
    value === "ask" ||
    value === "approve" ||
    value === "trim" ||
    value === "accept" ||
    value === "flag"
  );
}
