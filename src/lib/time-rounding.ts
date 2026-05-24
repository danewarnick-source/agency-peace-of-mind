/**
 * 7/8-minute quarter-hour rounding rule used for payroll/EVV billing.
 *
 *   :00–:07  -> :00
 *   :08–:22  -> :15
 *   :23–:37  -> :30
 *   :38–:52  -> :45
 *   :53–:59  -> next hour :00
 *
 * Seconds & milliseconds are dropped from the returned timestamp so the saved
 * value is a clean quarter-hour mark.
 */
export function roundToQuarterHour(input: Date | string | number): Date {
  const d = new Date(input);
  const m = d.getMinutes();
  let snapped: number;
  let addHour = 0;
  if (m <= 7) snapped = 0;
  else if (m <= 22) snapped = 15;
  else if (m <= 37) snapped = 30;
  else if (m <= 52) snapped = 45;
  else { snapped = 0; addHour = 1; }
  const out = new Date(d);
  out.setMinutes(snapped, 0, 0);
  if (addHour) out.setHours(out.getHours() + 1);
  return out;
}

/** Convenience: returns an ISO string snapped to the nearest quarter-hour. */
export function roundToQuarterHourIso(input: Date | string | number): string {
  return roundToQuarterHour(input).toISOString();
}

/** Decimal hours between two timestamps (or 0 if invalid). */
export function decimalHoursBetween(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!isFinite(ms) || ms <= 0) return 0;
  return ms / 3_600_000;
}
