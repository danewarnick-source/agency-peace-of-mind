import { ROLE_RANK, type Role } from "./rbac.ts";

/** True North Supports — first tenant. Never charged or locked. */
export const TNS_ORGANIZATION_ID = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";

export const ACTIVE_ORG_STORAGE_KEY = "hive.activeOrgId";

export type MembershipPick = {
  organization_id: string;
  is_demo: boolean;
  role: Role;
  display_acronym?: string | null;
  organization_name?: string | null;
};

/**
 * Signup-walk / sandbox agencies that must not steal the post-login default
 * away from True North (or any complimentary org) on Dane's main login.
 */
export function looksLikeDisposableTestOrg(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (n.includes("true north supports")) return false;
  if (/\btest agency\b/.test(n)) return true;
  if (n === "salt lake care co" || n.startsWith("salt lake care")) return true;
  if (/^pi(\d|[\s_-]|$)/.test(n)) return true;
  if (/\b(signup|test)\s+walk\b/.test(n)) return true;
  return false;
}

export function isComplimentaryMembership(
  org: Pick<MembershipPick, "organization_id" | "display_acronym" | "organization_name"> | null | undefined,
): boolean {
  if (!org) return false;
  if (isComplimentaryHiveOrg(org)) return true;
  return (org.organization_name ?? "").toLowerCase().includes("true north supports");
}

/**
 * Deterministic default: complimentary / True North first, then non-demo,
 * then non-disposable-test, then role rank, then org id.
 * A blank hive.activeOrgId is not "no organization."
 */
export function pickDefaultMembership<T extends MembershipPick>(
  memberships: T[],
): T | null {
  if (!memberships.length) return null;
  const sorted = [...memberships].sort((a, b) => {
    const ac = isComplimentaryMembership(a);
    const bc = isComplimentaryMembership(b);
    if (ac !== bc) return ac ? -1 : 1;
    if (a.is_demo !== b.is_demo) return a.is_demo ? 1 : -1;
    const at = looksLikeDisposableTestOrg(a.organization_name);
    const bt = looksLikeDisposableTestOrg(b.organization_name);
    if (at !== bt) return at ? 1 : -1;
    const r = ROLE_RANK[b.role] - ROLE_RANK[a.role];
    if (r !== 0) return r;
    return a.organization_id.localeCompare(b.organization_id);
  });
  return sorted[0] ?? null;
}

/**
 * Same resolution as the sidebar: stored id if it still matches — unless it is
 * a leftover test-signup org and the user also has True North / a complimentary
 * workspace. Then the complimentary org wins so a signup walk cannot trap the
 * main login on /billing-locked.
 */
export function resolveCurrentMembership<T extends MembershipPick>(
  memberships: T[],
  storedOrgId: string | null | undefined,
): T | null {
  if (!memberships.length) return null;
  const stored = String(storedOrgId ?? "").trim();
  if (stored) {
    const picked = memberships.find((m) => m.organization_id === stored);
    if (picked) {
      const hasComplimentary = memberships.some((m) => isComplimentaryMembership(m));
      if (hasComplimentary && looksLikeDisposableTestOrg(picked.organization_name)) {
        return pickDefaultMembership(memberships);
      }
      return picked;
    }
  }
  return pickDefaultMembership(memberships);
}

/**
 * After login / lock-gate: if the resolved org is locked, land on any unlocked
 * membership (True North first). Only stay locked when every membership is.
 */
export function pickUnlockedMembership<T extends MembershipPick>(
  memberships: T[],
  isLocked: (m: T) => boolean,
  storedOrgId?: string | null,
): T | null {
  if (!memberships.length) return null;
  const resolved = resolveCurrentMembership(memberships, storedOrgId);
  if (resolved && !isLocked(resolved)) return resolved;
  const unlocked = memberships.filter((m) => !isLocked(m));
  if (unlocked.length) return pickDefaultMembership(unlocked);
  return resolved;
}

/** TNS is complimentary. Do not add a pay button or Stripe customer. */
export function isComplimentaryHiveOrg(
  org: Pick<MembershipPick, "organization_id" | "display_acronym"> | null | undefined,
): boolean {
  if (!org) return false;
  if (org.organization_id === TNS_ORGANIZATION_ID) return true;
  return (org.display_acronym ?? "").trim().toUpperCase() === "TNS";
}

export function readStoredActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistActiveOrgId(orgId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (orgId) window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
    else window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
