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

/** Always assigned on hire. Titles must match seeded company_obligations rows. */
export const HIRE_ALWAYS_TITLES = [
  CODE_OF_CONDUCT_TITLE,
  CONFLICT_OF_INTEREST_TITLE,
  THIRTY_DAY_OBLIGATION_TITLE,
  CPR_OBLIGATION_TITLES[1],
  PCT_HIRE_COURSE_TITLE,
] as const;

export const HIRE_ALWAYS_TITLE_ALIASES: Record<string, readonly string[]> = {
  [CODE_OF_CONDUCT_TITLE]: [CODE_OF_CONDUCT_TITLE],
  [CONFLICT_OF_INTEREST_TITLE]: [CONFLICT_OF_INTEREST_TITLE],
  [THIRTY_DAY_OBLIGATION_TITLE]: [THIRTY_DAY_OBLIGATION_TITLE],
  [CPR_OBLIGATION_TITLES[1]]: [...CPR_OBLIGATION_TITLES],
  [PCT_HIRE_COURSE_TITLE]: [PCT_HIRE_COURSE_TITLE],
};

export const ABI_OBLIGATION_TITLES = [ABI_OBLIGATION_TITLE] as const;

export type ClientAssignmentFlags = {
  hasAbi: boolean;
  hasBehaviorPlan: boolean;
  hasLikelyAggression: boolean;
  hasPcsp: boolean;
};

export type StaffAssignmentFlags = {
  requiresAbi?: boolean;
  requiresDeescalation?: boolean;
};

/** Mandt when the client has a behavior plan or likely-aggression flag, or the staff is already flagged. */
export function assignmentNeedsMandt(
  client: ClientAssignmentFlags,
  staff?: StaffAssignmentFlags,
): boolean {
  return (
    client.hasBehaviorPlan ||
    client.hasLikelyAggression ||
    staff?.requiresDeescalation === true
  );
}

/** ABI once per staff — not once per ABI client. */
export function assignmentNeedsAbi(
  client: ClientAssignmentFlags,
  staff?: StaffAssignmentFlags,
): boolean {
  return client.hasAbi || staff?.requiresAbi === true;
}

export function assignmentNeedsSupportStrategies(client: ClientAssignmentFlags): boolean {
  return client.hasPcsp;
}

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

export function titleGroupsForHire(): string[][] {
  return HIRE_ALWAYS_TITLES.map((title) => [
    ...(HIRE_ALWAYS_TITLE_ALIASES[title] ?? [title]),
  ]);
}

/**
 * Existing-schema flags used for Mandt. Do not invent new columns:
 * behavior_support_clients.features_enabled, client_target_behaviors,
 * and profiles.requires_deescalation already encode the locked rule.
 */
export function clientFlagsFromExistingSchema(row: {
  has_abi?: boolean | null;
  pcsp_signed_date?: string | null;
  pcsp_expiration_date?: string | null;
  pcsp_goals?: unknown;
  behaviorPlanEnabled?: boolean | null;
  hasTargetBehaviors?: boolean | null;
}): ClientAssignmentFlags {
  const hasPcsp = Boolean(
    (typeof row.pcsp_signed_date === "string" && row.pcsp_signed_date.trim()) ||
      (typeof row.pcsp_expiration_date === "string" && row.pcsp_expiration_date.trim()) ||
      (Array.isArray(row.pcsp_goals) && row.pcsp_goals.length > 0),
  );
  const hasBehaviorPlan = row.behaviorPlanEnabled === true;
  const hasLikelyAggression = row.hasTargetBehaviors === true;
  return {
    hasAbi: row.has_abi === true,
    hasBehaviorPlan,
    hasLikelyAggression,
    hasPcsp,
  };
}
