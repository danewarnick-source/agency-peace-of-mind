/**
 * Who may open in-Hive courses that share the 30-day training seat.
 * True North / billing-exempt orgs never pay and never need a roster seat.
 * Paid orgs need a paid or waived 30-day or package roster seat for that staff.
 *
 * PCT reuses this same entitlement (no new Stripe product). ABI has an in-Hive
 * course but is assignment-gated, not seat-gated. 12-hour ongoing is an
 * obligation / pack column only — no course and no SKU.
 */

import { isBillingExempt } from "./billing-access.ts";
import { PCT_COURSE_ID } from "./in-hive-training-pct.ts";

export type ThirtyDayAccessReason =
  | "tns_or_comped"
  | "paid_roster_seat"
  | "training_only_seat"
  | "denied";

/**
 * Intended training family (30-day + PCT + ABI + 12hr). Stripe / roster today
 * only sell `thirty_day` and `package` / training-only `thirty_day` + `pack`.
 * `pack` still covers CPR + 30-day + Mandt — do not invent new prices.
 */
export const TRAINING_SEAT_FAMILY = {
  gatedByThirtyDaySeat: ["thirty-day", PCT_COURSE_ID],
  inHiveCourseNoSeat: ["abi"],
  obligationOnlyNoCourse: ["annual-ce"],
} as const;

/** 30-day orientation and hire-level PCT share one purchased seat. */
export function courseUsesThirtyDaySeat(courseId: string | null | undefined): boolean {
  return courseId === "thirty-day" || courseId === PCT_COURSE_ID;
}

/** Live Hive-Platform `organizations` has no `billing_exempt` column. */
export function orgSelectMissingBillingExempt(message: string | null | undefined): boolean {
  return /billing_exempt/i.test(message ?? "");
}

export type ThirtyDayOrgRow = {
  id?: string | null;
  name?: string | null;
  legal_name?: string | null;
  dba_name?: string | null;
  display_acronym?: string | null;
  billing_exempt?: boolean | null;
};

/** TNS / comped orgs skip purchased seats entirely. */
export function thirtyDayOrgIsComped(org: ThirtyDayOrgRow): boolean {
  return isBillingExempt({
    billingExempt: org.billing_exempt === true,
    orgName: org.name,
    legalName: org.legal_name,
    dbaName: org.dba_name,
    organizationId: org.id,
    displayAcronym: org.display_acronym,
  });
}

export function officeStaffMayTakeThirtyDay(input: {
  billingExempt: boolean;
  hasPaidRosterSeat: boolean;
}): boolean {
  return input.billingExempt === true || input.hasPaidRosterSeat === true;
}

export function resolveThirtyDayAccess(input: {
  billingExempt: boolean;
  hasPaidRosterSeat: boolean;
  hasTrainingOnlySeat?: boolean;
}): { allowed: boolean; reason: ThirtyDayAccessReason; charged: boolean } {
  if (input.billingExempt) {
    return { allowed: true, reason: "tns_or_comped", charged: false };
  }
  if (input.hasPaidRosterSeat) {
    return { allowed: true, reason: "paid_roster_seat", charged: true };
  }
  if (input.hasTrainingOnlySeat) {
    return { allowed: true, reason: "training_only_seat", charged: true };
  }
  return { allowed: false, reason: "denied", charged: false };
}

export function rosterTypeUnlocksThirtyDay(trainingType: string): boolean {
  return trainingType === "thirty_day" || trainingType === "package";
}

export function rosterPaymentUnlocksThirtyDay(paymentStatus: string): boolean {
  return paymentStatus === "paid" || paymentStatus === "waived";
}

export function staffMatchesRosterRow(
  staff: { userId: string; email: string | null },
  row: { staffUserId: string | null; staffEmail: string | null },
): boolean {
  if (row.staffUserId && row.staffUserId === staff.userId) return true;
  const a = (staff.email ?? "").trim().toLowerCase();
  const b = (row.staffEmail ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}
