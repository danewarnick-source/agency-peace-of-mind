// Quarter-hour rounding per Phase 1 spec.
// :00–:07 → :00, :08–:22 → :15, :23–:37 → :30, :38–:52 → :45, :53–:59 → next :00.
export function roundToQuarterHour(date: Date | string | number): Date {
  const d = new Date(date);
  const m = d.getMinutes();
  const out = new Date(d);
  out.setSeconds(0, 0);
  if (m <= 7) out.setMinutes(0);
  else if (m <= 22) out.setMinutes(15);
  else if (m <= 37) out.setMinutes(30);
  else if (m <= 52) out.setMinutes(45);
  else {
    out.setMinutes(0);
    out.setHours(out.getHours() + 1);
  }
  return out;
}

export function roundToQuarterHourISO(date: Date | string | number): string {
  return roundToQuarterHour(date).toISOString();
}
