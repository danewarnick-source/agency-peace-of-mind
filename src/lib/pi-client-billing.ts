/**
 * Locked PI list billing math. Source of truth is the org roster, not signup
 * guesses and not staff. Real client columns: created_at, discharge_date.
 */

import {
  addCalendarMonths,
  denverYmd,
  denverYmdFromInstant,
  parseYmd,
  ymdFromParts,
} from "./denver-date.ts";
import { ANNUAL_DISCOUNT } from "./hive-pricing.ts";
import {
  PI_LIST_MINIMUM_CENTS,
  PI_LIST_PER_CLIENT_CENTS,
  quotePiListSubscription,
} from "./pi-signup-pricing.ts";

/** YYYY-MM-DD. `end` is exclusive (first day after the period). */
export type BillingPeriod = {
  start: string;
  end: string;
};

export type BillableClientRow = {
  created_at: string;
  discharge_date: string | null;
};

export function ymdFromCreatedAt(createdAt: string): string {
  return denverYmdFromInstant(createdAt) ?? createdAt.slice(0, 10);
}

export function ymdFromDischargeDate(dischargeDate: string | null | undefined): string | null {
  if (!dischargeDate) return null;
  const ymd = dischargeDate.slice(0, 10);
  return parseYmd(ymd) ? ymd : null;
}

/**
 * High-water rule: count if created_at < period_end AND not discharged before
 * period_start. Deactivate on the 30th still counts that month.
 */
export function clientIsBillableInPeriod(row: BillableClientRow, period: BillingPeriod): boolean {
  const created = ymdFromCreatedAt(row.created_at);
  if (!created || created >= period.end) return false;
  const discharged = ymdFromDischargeDate(row.discharge_date);
  if (discharged && discharged < period.start) return false;
  return true;
}

export function countBillableClients(rows: readonly BillableClientRow[], period: BillingPeriod): number {
  let n = 0;
  for (const row of rows) {
    if (clientIsBillableInPeriod(row, period)) n += 1;
  }
  return n;
}

export function calendarMonthPeriod(now: Date = new Date()): BillingPeriod {
  const ymd = denverYmd(now);
  const p = parseYmd(ymd);
  if (!p) {
    const fallback = now.toISOString().slice(0, 10);
    return { start: fallback.slice(0, 8) + "01", end: fallback };
  }
  const start = ymdFromParts(p.year, p.month, 1);
  const next = addCalendarMonths(p.year, p.month, 1);
  return { start, end: ymdFromParts(next.year, next.month, 1) };
}

export function periodFromIsoRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  now: Date = new Date(),
): BillingPeriod {
  if (startIso && endIso) {
    return {
      start: denverYmdFromInstant(startIso) ?? startIso.slice(0, 10),
      end: denverYmdFromInstant(endIso) ?? endIso.slice(0, 10),
    };
  }
  return calendarMonthPeriod(now);
}

/** Calendar months from `now` through the prepaid period (inclusive of the current month). */
export function leftoverMonths(now: Date, periodEnd: Date): number {
  if (now.getTime() >= periodEnd.getTime()) return 0;
  const startIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  let endIdx = periodEnd.getUTCFullYear() * 12 + periodEnd.getUTCMonth();
  const endIsPeriodBoundary =
    periodEnd.getUTCDate() === 1 &&
    periodEnd.getUTCHours() === 0 &&
    periodEnd.getUTCMinutes() === 0 &&
    periodEnd.getUTCSeconds() === 0 &&
    periodEnd.getUTCMilliseconds() === 0;
  if (endIsPeriodBoundary) endIdx -= 1;
  return Math.max(0, endIdx - startIdx + 1);
}

export function monthlyCentsForClientCount(count: number): number {
  return quotePiListSubscription({ clientCount: count }).monthlyCents;
}

export type LeftoverAddInvoice = {
  previousCount: number;
  nextCount: number;
  addedClients: number;
  leftoverMonths: number;
  monthlyDeltaCents: number;
  yearlyDiscount: number;
  invoiceCents: number;
};

export function leftoverAddInvoice(input: {
  previousCount: number;
  nextCount: number;
  leftoverMonths: number;
  yearlyDiscount?: number;
}): LeftoverAddInvoice {
  const previousCount = Math.max(0, Math.floor(input.previousCount));
  const nextCount = Math.max(0, Math.floor(input.nextCount));
  const months = Math.max(0, Math.floor(input.leftoverMonths));
  const addedClients = Math.max(0, nextCount - previousCount);
  const yearlyDiscount = Math.min(1, Math.max(0, input.yearlyDiscount ?? 0));
  const monthlyDeltaCents = Math.max(
    0,
    monthlyCentsForClientCount(nextCount) - monthlyCentsForClientCount(previousCount),
  );
  const invoiceCents = Math.round(monthlyDeltaCents * months * (1 - yearlyDiscount));
  return {
    previousCount,
    nextCount,
    addedClients,
    leftoverMonths: months,
    monthlyDeltaCents,
    yearlyDiscount,
    invoiceCents,
  };
}

export type DropRenewalCredit = {
  previousCount: number;
  nextCount: number;
  droppedClients: number;
  leftoverMonths: number;
  monthlyDeltaCents: number;
  yearlyDiscount: number;
  creditCents: number;
  cashRefundCents: 0;
};

export function dropRenewalCredit(input: {
  previousCount: number;
  nextCount: number;
  leftoverMonths: number;
  yearlyDiscount?: number;
}): DropRenewalCredit {
  const previousCount = Math.max(0, Math.floor(input.previousCount));
  const nextCount = Math.max(0, Math.floor(input.nextCount));
  const months = Math.max(0, Math.floor(input.leftoverMonths));
  const droppedClients = Math.max(0, previousCount - nextCount);
  const yearlyDiscount = Math.min(1, Math.max(0, input.yearlyDiscount ?? 0));
  const monthlyDeltaCents = Math.max(
    0,
    monthlyCentsForClientCount(previousCount) - monthlyCentsForClientCount(nextCount),
  );
  const creditCents = Math.round(monthlyDeltaCents * months * (1 - yearlyDiscount));
  return {
    previousCount,
    nextCount,
    droppedClients,
    leftoverMonths: months,
    monthlyDeltaCents,
    yearlyDiscount,
    creditCents,
    cashRefundCents: 0,
  };
}

export function annualCancelRefundCents(): 0 {
  return 0;
}

export function prepaidYearKeepsAccess(input: {
  interval: string | null | undefined;
  periodEndIso: string | null | undefined;
  now?: Date;
}): boolean {
  if (input.interval !== "annual") return false;
  if (!input.periodEndIso) return false;
  const end = Date.parse(input.periodEndIso);
  if (!Number.isFinite(end)) return false;
  return end > (input.now ?? new Date()).getTime();
}

export function yearlyDiscountForInterval(interval: string | null | undefined): number {
  return interval === "annual" ? ANNUAL_DISCOUNT : 0;
}

export const PI_LIST_BILLING = {
  perClientCents: PI_LIST_PER_CLIENT_CENTS,
  minimumCents: PI_LIST_MINIMUM_CENTS,
} as const;
