import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { ROLE_RANK, type Role } from "@/lib/rbac";
import { resolveCurrentMembership } from "@/lib/current-org";

export type { Role };

export interface CurrentMembership {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  legal_name: string | null;
  dba_name: string | null;
  display_acronym: string | null;
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
    .select("id, role, job_title, organization_id, organizations(name, is_demo, legal_name, dba_name, display_acronym)")
    .eq("user_id", userId)
    .eq("active", true);
  if (error || !data?.length) return [];
  type OrgRow = { name: string; is_demo: boolean; legal_name: string | null; dba_name: string | null; display_acronym: string | null } | null;
  return [...data]
    .sort((a, b) => ROLE_RANK[b.role as Role] - ROLE_RANK[a.role as Role])
    .map((m) => {
      const o = m.organizations as OrgRow;
      return {
        membership_id: m.id,
        organization_id: m.organization_id,
        organization_name: o?.name ?? "Workspace",
        legal_name: o?.legal_name ?? null,
        dba_name: o?.dba_name ?? null,
        display_acronym: o?.display_acronym ?? null,
        role: m.role as Role,
        job_title: m.job_title,
        is_demo: o?.is_demo ?? false,
      };
    });
}

/**
 * Single source of truth for provider-name display.
 * - acronym: short label for column headers / tab names. Empty string when unset
 *   (callers should fall back to a neutral label, never a broken blank).
 * - displayName: best human-friendly name (DBA > legal > org name).
 * - legalName: full legal entity name (DBA > legal > org name fallback chain).
 * - prefixLabel(suffix): convenience for tokenized labels like "TNS Gross".
 *   Returns "<acronym> <suffix>" when acronym is set, else the bare suffix.
 */
export function useOrgDisplayName() {
  const { data: org } = useCurrentOrg();
  const acronym = (org?.display_acronym ?? "").trim();
  const legalName = (org?.legal_name ?? "").trim() || org?.organization_name || "";
  const dbaName = (org?.dba_name ?? "").trim();
  const displayName = dbaName || legalName || org?.organization_name || "";
  return {
    acronym,
    legalName,
    dbaName,
    displayName,
    prefixLabel: (suffix: string) => (acronym ? `${acronym} ${suffix}` : suffix),
  };
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
 * Returns the active membership for the signed-in user. Resolution is
 * deterministic:
 *   1. persisted activeOrgId (localStorage), if it still maps to an active membership
 *   2. otherwise a stable non-demo-preferred default (see resolveCurrentMembership)
 * A demo org is NEVER selected as an accidental load-time fallback, which
 * kills the demo-banner race on multi-org users.
 *
 * Query key is [userId] only. Including hive.activeOrgId split the cache so
 * the sidebar (hydrated id) could show TNS Owner while a child page
 * (null id) rendered "No active organization."
 */
export function useCurrentOrg() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // SSR-safe: initialize to null so server and first-client paint match.
  // LocalStorage is read inside useEffect (after mount) to avoid hydration mismatch.
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setActiveOrgIdState(readActiveOrgId());
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_ORG_KEY) {
        setActiveOrgIdState(e.newValue);
        void qc.invalidateQueries({ queryKey: ["current-org", user?.id] });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc, user?.id]);

  const q = useQuery({
    enabled: !!user,
    queryKey: ["current-org", user?.id],
    queryFn: async (): Promise<CurrentMembership | null> => {
      const memberships = await fetchMemberships(user!.id);
      // Read storage inside the query so a blank first paint still picks TNS.
      return resolveCurrentMembership(memberships, readActiveOrgId());
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
