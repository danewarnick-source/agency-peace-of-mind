// Shared reminder cadence for UPI/monthly-summary attestations that must
// nag on the 1st, 5th, and 10th of the month following the period they
// cover, and go silent the instant the attestation lands (prompts 20/21/25).

/** True on the 1st, 5th, or 10th of the month — the three reminder-fire days. */
export function isUpiReminderFireDay(now: Date): boolean {
  const d = now.getDate();
  return d === 1 || d === 5 || d === 10;
}
