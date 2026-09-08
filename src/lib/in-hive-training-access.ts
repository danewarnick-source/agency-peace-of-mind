/**
 * Who may open the in-Hive 30-day course.
 * True North / billing-exempt orgs never pay and never need a roster seat.
 * Paid orgs need a paid or waived 30-day or package roster seat for that staff.
 */

export type ThirtyDayAccessReason =
  | "tns_or_comped"
  | "paid_roster_seat"
  | "training_only_seat"
  | "denied";

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
