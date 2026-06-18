import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";

function lsKey(orgId: string, suffix: string) {
  return `hive_onboarding_${orgId}_${suffix}`;
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Shared onboarding completion source-of-truth used by the NECTAR
 * onboarding panel, the persistent return bar, and the per-page guidance
 * banners. Step 1/3/4/6 derive from real DB counts; Step 2/5 derive from
 * per-org localStorage flags written from the panel/profile page.
 */
export function useOnboardingProgress() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const [profileSaved, setProfileSaved] = useState(false);
  const [servicesVisited, setServicesVisited] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setProfileSaved(readLS(lsKey(orgId, "profile_saved"), false));
    setServicesVisited(readLS(lsKey(orgId, "services_visited"), false));
    // Re-read on focus so completion flips immediately after returning
    // from a destination page that just wrote the flag.
    const onFocus = () => {
      setProfileSaved(readLS(lsKey(orgId, "profile_saved"), false));
      setServicesVisited(readLS(lsKey(orgId, "services_visited"), false));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [orgId]);

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["nectar-onboarding-progress", orgId],
    queryFn: async () => {
      const [authDocs, attestations, members, clients, codes, allDocs] = await Promise.all([
        supabase
          .from("nectar_documents")
          .select("id, authoritative_kind", { count: "exact" })
          .eq("organization_id", orgId!)
          .eq("is_authoritative_source", true),
        supabase
          .from("nectar_attestations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .eq("scope", "document_upload"),
        supabase
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("service_codes")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
        supabase
          .from("nectar_documents")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!),
      ]);
      const authRows = (authDocs.data ?? []) as Array<{ authoritative_kind: string | null }>;
      const sowCount = authRows.filter((r) => r.authoritative_kind === "state_sow").length;
      return {
        authSourcesCount: authDocs.count ?? authRows.length,
        sowCount,
        attestationCount: attestations.count ?? 0,
        memberCount: members.count ?? 0,
        clientCount: clients.count ?? 0,
        serviceCodeCount: codes.count ?? 0,
        docsCount: allDocs.count ?? 0,
      };
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const c = q.data ?? {
    authSourcesCount: 0,
    sowCount: 0,
    attestationCount: 0,
    memberCount: 0,
    clientCount: 0,
    serviceCodeCount: 0,
    docsCount: 0,
  };

  const step1 = c.sowCount > 0 && c.attestationCount > 0;
  // step 5 unlocks via either localStorage flag OR a real service_codes row
  const step5 = servicesVisited || c.serviceCodeCount > 0;

  const steps = {
    1: step1,
    2: profileSaved,
    3: c.memberCount > 1,
    4: c.clientCount > 0,
    5: step5,
    6: c.docsCount > 0,
  } as const;

  const completedCount = Object.values(steps).filter(Boolean).length;
  const totalSteps = 6;
  const allComplete = completedCount === totalSteps;
  const dismissed = !!orgId && readLS<boolean>(lsKey(orgId, "dismissed"), false);

  return {
    orgId,
    counts: c,
    steps,
    step1Complete: step1,
    completedCount,
    totalSteps,
    allComplete,
    dismissed,
    /** True when the persistent return bar / guidance should appear at all. */
    onboardingActive: !!orgId && !allComplete && !dismissed,
    refetch: q.refetch,
  };
}

export { lsKey as onboardingLSKey };
