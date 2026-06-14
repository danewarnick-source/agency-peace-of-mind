// Shared incident deadline math. Single source of truth for both the admin
// incidents section and the agency-wide Deadlines page. Do not duplicate
// this logic — extend it here.

/** Add N business days to a date (skip Sat/Sun). */
export function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

export type IncidentClock = {
  kind: "upi_initiated" | "upi_completed";
  label: string;
  deadline: Date;
  done: boolean;
};

export type IncidentClockInput = {
  discovered_at: string | null;
  upi_initiated_at: string | null;
  upi_completed_at: string | null;
};

/** Return the still-open clocks for an incident (omits done ones). */
export function getIncidentOpenClocks(i: IncidentClockInput): IncidentClock[] {
  if (!i.discovered_at) return [];
  const disc = new Date(i.discovered_at);
  const clocks: IncidentClock[] = [];
  if (!i.upi_initiated_at) {
    clocks.push({
      kind: "upi_initiated",
      label: "24-hour UPI notification",
      deadline: new Date(disc.getTime() + 24 * 3_600_000),
      done: false,
    });
  }
  if (!i.upi_completed_at) {
    clocks.push({
      kind: "upi_completed",
      label: "5-business-day UPI completion",
      deadline: addBusinessDays(disc, 5),
      done: false,
    });
  }
  return clocks;
}
