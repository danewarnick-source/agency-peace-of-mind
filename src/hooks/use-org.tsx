import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const rank: Record<Role, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
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
 * Returns the active membership for the signed-in user. The user can pick
 * which org is active via the org switcher; their choice persists in
 * localStorage. Falls back to the highest-privilege membership if no choice
 * has been made (or the saved choice is no longer valid).
 */
export function useCurrentOrg() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Track the active selection so re-renders happen on switch.
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => readActiveOrgId());

  useEffect(() => {
    if (typeof window === "undefined") return;
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
      return memberships[0]; // highest-privilege fallback
    },
  });

  const setActiveOrgId = useCallback(
    (orgId: string | null) => {
      writeActiveOrgId(orgId);
      setActiveOrgIdState(orgId);
      // Drop cached queries that depend on org context so the UI re-fetches.
      queryClient.cancelQueries();
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  return { ...q, activeOrgId, setActiveOrgId };
}
