// Pure helpers for client progress summary periods.
// HHS / RHS / DSI / SLH / SLN → quarterly (due 15 days after quarter end).
// SEI → monthly (due 15th of following month, requires UPI attestation).

export const QUARTERLY_SUMMARY_CODES = new Set(["HHS", "RHS", "DSI", "SLH", "SLN"]);
export const MONTHLY_SUMMARY_CODES = new Set(["SEI"]);

export type SummaryPeriod = {
  period_kind: "quarterly" | "monthly";
  period_label: string;       // "2026-Q2" | "2026-06"
  period_start: string;       // YYYY-MM-DD
  period_end: string;         // YYYY-MM-DD
  due_date: string;           // YYYY-MM-DD
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** All closed quarterly periods in the last `limit` quarters (most recent first). */
export function recentQuarterlyPeriods(now: Date, limit = 4): SummaryPeriod[] {
  const out: SummaryPeriod[] = [];
  // Determine current quarter index, then walk backwards.
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1; // 1..4
  // Step to previous quarter first (we only emit closed quarters).
  for (let i = 0; i < limit; i++) {
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
    const startMonth = (q - 1) * 3;
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 0);
    if (end >= now) continue; // not closed yet
    const due = new Date(end.getTime() + 15 * 86_400_000);
    out.push({
      period_kind: "quarterly",
      period_label: `${y}-Q${q}`,
      period_start: iso(start),
      period_end: iso(end),
      due_date: iso(due),
    });
  }
  return out;
}

/** All closed monthly periods in the last `limit` months (most recent first). */
export function recentMonthlyPeriods(now: Date, limit = 6): SummaryPeriod[] {
  const out: SummaryPeriod[] = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // current month index; we step back first
  for (let i = 0; i < limit; i++) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    if (end >= now) continue;
    // Due 15th of the following month.
    const due = new Date(y, m + 1, 15);
    out.push({
      period_kind: "monthly",
      period_label: `${y}-${pad(m + 1)}`,
      period_start: iso(start),
      period_end: iso(end),
      due_date: iso(due),
    });
  }
  return out;
}

/** Decide which periods a client owes given their active service codes. */
export function periodsOwedForClient(
  serviceCodes: string[],
  now: Date,
): SummaryPeriod[] {
  const codes = new Set(serviceCodes.map((c) => c.toUpperCase()));
  const owesQuarterly = [...codes].some((c) => QUARTERLY_SUMMARY_CODES.has(c));
  const owesMonthly = [...codes].some((c) => MONTHLY_SUMMARY_CODES.has(c));
  const out: SummaryPeriod[] = [];
  if (owesQuarterly) out.push(...recentQuarterlyPeriods(now));
  if (owesMonthly) out.push(...recentMonthlyPeriods(now));
  return out;
}
