/**
 * scheduled_shifts.status CHECK allows only:
 *   draft | published | accepted | declined | open | cancelled
 *
 * Older UI paths used "pending", which Postgres rejects with
 * scheduled_shifts_status_check. Coerce to a valid value on write.
 *
 * created_from CHECK allows only:
 *   manual | template | nectar | import | rotation
 * (null ok). Values like "recurring" / "copy" are invalid — use "manual".
 */

export const SCHEDULED_SHIFT_STATUSES = [
  "draft",
  "published",
  "accepted",
  "declined",
  "open",
  "cancelled",
] as const;

export type ScheduledShiftStatus = (typeof SCHEDULED_SHIFT_STATUSES)[number];

const ALLOWED = new Set<string>(SCHEDULED_SHIFT_STATUSES);

/** Status for a newly created unpublished shift. */
export function newShiftStatus(staffId: string | null | undefined): "draft" | "open" {
  return staffId ? "draft" : "open";
}

/** Map legacy / invalid statuses onto the CHECK allowlist. */
export function coerceScheduledShiftStatus(
  status: string | null | undefined,
  staffId: string | null | undefined,
): ScheduledShiftStatus {
  if (status && ALLOWED.has(status)) return status as ScheduledShiftStatus;
  // Legacy "pending" (and anything else unexpected) → draft when assigned, else open.
  return newShiftStatus(staffId);
}
