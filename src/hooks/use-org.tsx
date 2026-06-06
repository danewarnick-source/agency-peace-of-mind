import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { Role } from "@/lib/rbac";

export type { Role };

export interface CurrentMembership {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  role: Role;
  job_title: string | null;
  is_demo: boolean;
}

const ACTIVE_ORG_KEY = "hive.activeOrgId";

function readActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function writeActiveOrgId(orgId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    else window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchMemberships(userId: string): Promise<CurrentMembership[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, job_title, organization_id, organizations(name, is_demo)")
    .eq("user_id", userId)
    .eq("active", true);
  if (error || !data?.length) return [];
  const rank: Record<Role, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3, committee_member: 4 };
  return [...data]
    .sort((a, b) => rank[a.role as Role] - rank[b.role as Role])
    .map((m) => ({
      membership_id: m.id,
      organization_id: m.organization_id,
      organization_name:
        (m.organizations as { name: string; is_demo: boolean } | null)?.name ?? "Workspace",
      role: m.role as Role,
      job_title: m.job_title,
      is_demo:
        (m.organizations as { name: string; is_demo: boolean } | null)?.is_demo ?? false,
    }));
}

/**
 * Returns all active memberships for the signed-in user. Used by the org
 * switcher to enumerate workspaces.
 */
export function useMyMemberships() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-memberships", user?.id],
    queryFn: () => fetchMemberships(user!.id),
  });
}

/**
 * Deterministic default picker: prefer a non-demo org so a demo workspace
 * can never win as an accidental load-time fallback. Within each group
 * (non-demo / demo) sort by role rank, then organization_id for stability.
 */
function pickDefaultMembership(memberships: CurrentMembership[]): CurrentMembership | null {
  if (!memberships.length) return null;
  const rank: Record<Role, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3, committee_member: 4 };
  const sorted = [...memberships].sort((a, b) => {
    if (a.is_demo !== b.is_demo) return a.is_demo ? 1 : -1; // non-demo first
    const r = rank[a.role] - rank[b.role];
    if (r !== 0) return r;
    return a.organization_id.localeCompare(b.organization_id);
  });
  return sorted[0];
}

/**
 * Returns the active membership for the signed-in user. Resolution is
 * deterministic:
 *   1. persisted activeOrgId (localStorage), if it still maps to an active membership
 *   2. otherwise a stable non-demo-preferred default (see pickDefaultMembership)
 * A demo org is NEVER selected as an accidental load-time fallback, which
 * kills the demo-banner race on multi-org users.
 */
export function useCurrentOrg() {
  const { user } = useAuth();

  // SSR-safe: initialize to null so server and first-client paint match.
  // LocalStorage is read inside useEffect (after mount) to avoid hydration mismatch.
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setActiveOrgIdState(readActiveOrgId());
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_ORG_KEY) setActiveOrgIdState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const q = useQuery({
    enabled: !!user,
    queryKey: ["current-org", user?.id, activeOrgId],
    queryFn: async (): Promise<CurrentMembership | null> => {
      const memberships = await fetchMemberships(user!.id);
      if (!memberships.length) return null;
      if (activeOrgId) {
        const picked = memberships.find((m) => m.organization_id === activeOrgId);
        if (picked) return picked;
      }
      return pickDefaultMembership(memberships);
    },
  });

  /**
   * Switch active org with a full app reload. Bulletproof: persist the new
   * id, then reload so every query, hook, and component re-initializes from
   * a single deterministic source — no half-switched state where chrome and
   * data disagree. Switching to the same org is a no-op.
   */
  const setActiveOrgId = useCallback((orgId: string | null) => {
    if (typeof window === "undefined") {
      writeActiveOrgId(orgId);
      setActiveOrgIdState(orgId);
      return;
    }
    const current = readActiveOrgId();
    if (current === orgId) return;
    writeActiveOrgId(orgId);
    window.location.assign("/dashboard");
  }, []);

  return { ...q, activeOrgId, setActiveOrgId };
}
