/**
 * Locked auto-assign rules for company obligations.
 *
 * Hive writes the staff list. Staff never pick or self-enroll.
 * Calendar renewals stay on the existing cadence engine — this module
 * only decides *which* locked rows to open, and never invents a second clock.
 */

import { ABI_OBLIGATION_TITLE, THIRTY_DAY_OBLIGATION_TITLE } from "./in-hive-training.ts";
import { CPR_OBLIGATION_TITLES, MANDT_OBLIGATION_TITLES } from "./training-class.ts";
import { PCT_HIRE_COURSE_TITLE } from "./client-form-obligations.ts";

export const CODE_OF_CONDUCT_TITLE = "DHHS Code of Conduct — Signed";
export const CONFLICT_OF_INTEREST_TITLE = "Staff Conflict of Interest Process";

/** Always assigned on hire. Titles must match seeded company_obligations rows.
 * Standing catalog duties (e.g. Staff Conflict of Interest Process) stay
 * off this list — they must not get a hire clock. */
export const HIRE_ALWAYS_TITLES = [
  CODE_OF_CONDUCT_TITLE,
  THIRTY_DAY_OBLIGATION_TITLE,
  CPR_OBLIGATION_TITLES[1],
  PCT_HIRE_COURSE_TITLE,
] as const;

export function hireDueDaysForTitle(title: string): number {
  if (title === THIRTY_DAY_OBLIGATION_TITLE) return 30;
  if (title === CODE_OF_CONDUCT_TITLE) return 30;
  if (title === CONFLICT_OF_INTEREST_TITLE) return 30;
  if (CPR_OBLIGATION_TITLES.includes(title as (typeof CPR_OBLIGATION_TITLES)[number])) return 90;
  if (title === PCT_HIRE_COURSE_TITLE) return 90;
  if (title === ABI_OBLIGATION_TITLE || title.startsWith("ABI Training")) return 90;
  if (MANDT_OBLIGATION_TITLES.includes(title as (typeof MANDT_OBLIGATION_TITLES)[number])) {
    return 180;
  }
  return 30;
}
