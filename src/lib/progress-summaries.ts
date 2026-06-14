// Pure helpers for client progress summary periods.
// HHS / RHS / DSI / SLH / SLN → quarterly narrative (due 15 days after quarter end).
// SEI / PN1 / PN2 → monthly narrative (due 15th of following month).
//   SEI additionally requires UPI attestation.
// PBA → monthly FINANCIAL STATEMENT marker (no AI draft).
//
// Goal-progress section is omitted entirely for clients whose only services
// are in GOAL_PROGRESS_EXCLUDED_CODES (ELS, MTP, PBA, PM1/PM2, RP/RL respite).

export const QUARTERLY_SUMMARY_CODES = new Set(["HHS", "RHS", "DSI", "SLH", "SLN"]);
export const MONTHLY_SUMMARY_CODES = new Set(["SEI", "PN1", "PN2"]);
export const FINANCIAL_STATEMENT_CODES = new Set(["PBA"]);

/** Services where contract does NOT require goal-progress reporting. */
export const GOAL_PROGRESS_EXCLUDED_CODES = new Set([
  "ELS", "MTP", "PBA",
  "PM1", "PM2",
  "RP2", "RP3", "RP4", "RP5", "RL6",
]);

/** True when at least one of the client's services REQUIRES goal-progress reporting. */
export function clientNeedsGoalProgress(serviceCodes: string[]): boolean {
  return serviceCodes.some((c) => !GOAL_PROGRESS_EXCLUDED_CODES.has(c.toUpperCase()));
}

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
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < limit; i++) {
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
    const startMonth = (q - 1) * 3;
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 0);
    if (end >= now) continue;
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
  let m = now.getMonth();
  for (let i = 0; i < limit; i++) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    if (end >= now) continue;
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

export type SummaryBuckets = {
  quarterly: Set<string>;
  monthlyNarrative: Set<string>;  // SEI / PN1 / PN2
  monthlyFinancial: Set<string>;  // PBA
};

export function bucketCodes(codes: string[]): SummaryBuckets {
  const b: SummaryBuckets = { quarterly: new Set(), monthlyNarrative: new Set(), monthlyFinancial: new Set() };
  for (const raw of codes) {
    const c = raw.toUpperCase();
    if (QUARTERLY_SUMMARY_CODES.has(c)) b.quarterly.add(c);
    if (MONTHLY_SUMMARY_CODES.has(c)) b.monthlyNarrative.add(c);
    if (FINANCIAL_STATEMENT_CODES.has(c)) b.monthlyFinancial.add(c);
  }
  return b;
}
