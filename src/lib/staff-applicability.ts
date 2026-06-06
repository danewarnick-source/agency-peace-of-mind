// Shared applicability logic — used by matrix, staff HR card, and rollup.
//
// Rule (UNION across the staffer's types):
//  - If the requirement's mapping is NOT yet confirmed → applicable (no
//    hiding without explicit company confirmation).
//  - If applies_to_staff_types === "all" → applicable.
//  - If staff has NO types set → applicable (untyped = treated as all).
//  - Else applicable iff intersection(staff_type_keys, applies_to) is non-empty.
//
// N/A only ever appears when (a) admin confirmed the narrowing AND
// (b) the staffer has explicit types AND (c) none of them are in the
// confirmed applies-to list.

export type AppliesTo = string[] | "all" | null | undefined;

export function isRequirementApplicable(args: {
  applies_to: AppliesTo;
  applies_to_confirmed_at: string | null | undefined;
  staff_type_keys: string[] | null | undefined;
}): boolean {
  const { applies_to, applies_to_confirmed_at, staff_type_keys } = args;
  // Not narrowed/confirmed by the company yet → never hide.
  if (!applies_to_confirmed_at) return true;
  if (!applies_to || applies_to === "all") return true;
  if (!Array.isArray(applies_to) || applies_to.length === 0) return true;
  const keys = staff_type_keys ?? [];
  if (keys.length === 0) return true; // untyped staffer
  const set = new Set(applies_to);
  return keys.some((k) => set.has(k));
}

export function parseAppliesTo(metadata: unknown): {
  applies_to: AppliesTo;
  applies_to_confirmed_at: string | null;
} {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const at = m.applies_to_staff_types;
  const applies_to: AppliesTo =
    at === "all" || Array.isArray(at) ? (at as string[] | "all") : "all";
  return {
    applies_to,
    applies_to_confirmed_at:
      (m.applies_to_confirmed_at as string | null) ?? null,
  };
}
