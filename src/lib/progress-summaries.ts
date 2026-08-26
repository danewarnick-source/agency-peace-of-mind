// Pure helpers for client progress summary periods.
// HHS / RHS / DSI / SLH / SLN → quarterly narrative (due 15 days after quarter end).
// SEI / PN1 / PN2 / CMP / CMS → monthly narrative (due 15th of following month).
//   SEI additionally requires UPI attestation.
// PBA → monthly FINANCIAL STATEMENT marker (no AI draft).
//
// Goal-progress section is omitted entirely for clients whose only services
// are in GOAL_PROGRESS_EXCLUDED_CODES (ELS, MTP, PBA, PM1/PM2, RP/RL respite).

export const QUARTERLY_SUMMARY_CODES = new Set(["HHS", "RHS", "DSI", "SLH", "SLN"]);
// CMP/CMS moved from (implicit, never-generated) quarterly to explicit monthly
// cadence — forward-looking only, does not touch any historical quarterly rows.
// SJD (Supported Employment — Job Development) also monthly, same UPI
// attestation requirement as SEI.
export const MONTHLY_SUMMARY_CODES = new Set(["SEI", "SJD", "PN1", "PN2", "CMP", "CMS"]);
export const FINANCIAL_STATEMENT_CODES = new Set(["PBA"]);

/**
 * Lightweight per-code required-field guidance surfaced to Nectar's draft
 * prompt for monthly narrative summaries. Freeform prose otherwise — this
 * only nudges which topics must be covered for codes with specific content
 * requirements (SEI, SJD). Codes not listed here get no extra guidance.
 */
export const MONTHLY_SUMMARY_REQUIRED_FIELDS: Record<string, string[]> = {
  SJD: [
    "Person's name",
    "Service code: SJD",
    "Date range covered",
    "All employment activities during the period",
    "Person's response to the service",
    "Progress toward employment goals",
    "Documentation of weekly assessment data",
    "Staff name",
    "USOR contact date and current funding status",
  ],
};

/** "2026-06" -> "June 2026". Shared by the deadlines panel and notification bell. */
export function formatPeriodMonthYear(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

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

/**
 * The current (still in-progress) quarter plus the last `limit` CLOSED
 * quarters, most recent first. The in-progress quarter is included so a
 * summary can be typed or Nectar-drafted any time before it closes — its
 * due_date is real (quarter end + 15 days) but still in the future, so
 * callers must not treat it as due/overdue just because a row exists.
 */
export function recentQuarterlyPeriods(now: Date, limit = 4): SummaryPeriod[] {
  const out: SummaryPeriod[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < limit + 1; i++) {
    if (i > 0) {
      q -= 1;
      if (q < 1) { q = 4; y -= 1; }
    }
    const startMonth = (q - 1) * 3;
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 0);
    // Only the current (i === 0) period may still be open; every prior one
    // must already be closed.
    if (i > 0 && end >= now) continue;
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

/**
 * The current (still in-progress) month plus the last `limit` CLOSED
 * months, most recent first. Same in-progress-first shape as
 * recentQuarterlyPeriods — see its doc comment.
 */
export function recentMonthlyPeriods(now: Date, limit = 6): SummaryPeriod[] {
  const out: SummaryPeriod[] = [];
  let y = now.getFullYear();
  let m = now.getMonth();
  for (let i = 0; i < limit + 1; i++) {
    if (i > 0) {
      m -= 1;
      if (m < 0) { m = 11; y -= 1; }
    }
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    if (i > 0 && end >= now) continue;
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

/** True when a period's own window hasn't closed yet — the row exists so
 *  drafting can start early, but it is not "owed" until this flips false. */
export function isPeriodInProgress(periodEnd: string, now: Date = new Date()): boolean {
  return new Date(`${periodEnd}T23:59:59`).getTime() >= now.getTime();
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

/** Codes typed into the state UPI portal (admin attestation after finalize). */
export const UPI_FILING_CODES = new Set(["SEI", "SJD"]);

/** True when this period's services require UPI entry (not SC email). */
export function requiresUpiFiling(serviceCodes: string[]): boolean {
  return serviceCodes.some((c) => UPI_FILING_CODES.has(c.toUpperCase()));
}

/**
 * Filing destination for a narrative summary after finalize.
 * SEI/SJD → UPI portal; everything else narrative → Support Coordinator.
 */
export type SummaryFilingDestination = "upi" | "support_coordinator" | "none";

export function summaryFilingDestination(
  summaryKind: string,
  serviceCodes: string[],
): SummaryFilingDestination {
  if (summaryKind === "financial_statement") return "support_coordinator";
  if (summaryKind !== "narrative") return "none";
  if (requiresUpiFiling(serviceCodes)) return "upi";
  return "support_coordinator";
}

export function summaryCadenceLabel(periodKind: string, serviceCodes: string[]): string {
  if (periodKind === "quarterly") {
    return "Quarterly · due 15 days after quarter end · to Support Coordinator";
  }
  if (requiresUpiFiling(serviceCodes)) {
    return "Monthly · due 15th of following month · enter in UPI";
  }
  return "Monthly · due 15th of following month · to Support Coordinator";
}

/**
 * Single source of truth for "when does this client's HIVE summary clock start."
 * Later of org go-live and client HIVE start (hive_start_date → created_at).
 * Callers still apply per-code service_start_date on top.
 * Periods whose period_end is strictly before this floor must never be generated.
 */
export function summaryPeriodFloor(opts: {
  orgGoLiveDate: string | null | undefined;
  clientHiveStartDate: string | null | undefined;
  clientCreatedAt: string | null | undefined;
}): string | null {
  const org = (opts.orgGoLiveDate ?? "").slice(0, 10) || null;
  const clientStart =
    (opts.clientHiveStartDate ?? "").slice(0, 10) ||
    (opts.clientCreatedAt ?? "").slice(0, 10) ||
    null;
  const parts = [org, clientStart].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d));
  if (parts.length === 0) return null;
  return parts.sort()[parts.length - 1];
}

/** Drop periods that closed before the floor (period_end < floor). */
export function filterPeriodsByFloor<T extends { period_end: string }>(
  periods: T[],
  floor: string | null,
): T[] {
  if (!floor) return periods;
  return periods.filter((p) => p.period_end >= floor);
}
