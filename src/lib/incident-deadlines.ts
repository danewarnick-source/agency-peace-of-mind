// Shared incident deadline math. Single source of truth for both the admin
// incidents section and the agency-wide Deadlines page. Do not duplicate
// this logic — extend it here.

export type IncidentClock = {
  kind: "upi_submission";
  label: string;
  deadline: Date;
  done: boolean;
};

export type IncidentClockInput = {
  discovered_at: string | null;
  upi_submitted_at: string | null;
};

/** Return the still-open clocks for an incident (omits done ones). The
 *  UPI-submission + guardian-notification duty is a single signed action —
 *  see submitToUpi — so there is exactly one clock. */
export function getIncidentOpenClocks(i: IncidentClockInput): IncidentClock[] {
  if (!i.discovered_at || i.upi_submitted_at) return [];
  const disc = new Date(i.discovered_at);
  return [{
    kind: "upi_submission",
    label: "24-hour UPI submission & guardian notification",
    deadline: new Date(disc.getTime() + 24 * 3_600_000),
    done: false,
  }];
}
