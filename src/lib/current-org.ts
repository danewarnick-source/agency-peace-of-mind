import { ROLE_RANK, type Role } from "./rbac.ts";

/** True North Supports — first tenant. Never charged or locked. */
export const TNS_ORGANIZATION_ID = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";

export type MembershipPick = {
  organization_id: string;
  is_demo: boolean;
  role: Role;
  display_acronym?: string | null;
  organization_name?: string | null;
};

/**
 * Deterministic default: non-demo first, then role rank, then org id.
 * A blank hive.activeOrgId is not "no organization."
 */
export function pickDefaultMembership<T extends MembershipPick>(
  memberships: T[],
): T | null {
  if (!memberships.length) return null;
  const sorted = [...memberships].sort((a, b) => {
    if (a.is_demo !== b.is_demo) return a.is_demo ? 1 : -1;
    const r = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    if (r !== 0) return r;
    return a.organization_id.localeCompare(b.organization_id);
  });
  return sorted[0];
}

/** Same resolution as the sidebar: stored id if it still matches, else default. */
export function resolveCurrentMembership<T extends MembershipPick>(
  memberships: T[],
  storedOrgId: string | null | undefined,
): T | null {
  if (!memberships.length) return null;
  const stored = String(storedOrgId ?? "").trim();
  if (stored) {
    const picked = memberships.find((m) => m.organization_id === stored);
    if (picked) return picked;
  }
  return pickDefaultMembership(memberships);
}

/** TNS is complimentary. Do not add a pay button or Stripe customer. */
export function isComplimentaryHiveOrg(
  org: Pick<MembershipPick, "organization_id" | "display_acronym"> | null | undefined,
): boolean {
  if (!org) return false;
  if (org.organization_id === TNS_ORGANIZATION_ID) return true;
  return (org.display_acronym ?? "").trim().toUpperCase() === "TNS";
}
