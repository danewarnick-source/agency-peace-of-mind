import { useQuery } from "@tanstack/react-query";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { catalogForState, emptyCatalogShellMessage, normalizeStateCode } from "@/lib/state-catalog";

export function useOrgStateCatalog() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["org-state-catalog", orgId],
    queryFn: async () => {
      if (!orgId) return { state_code: null as string | null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("organizations")
        .select("state_code")
        .eq("id", orgId)
        .maybeSingle();
      if (error) {
        return { state_code: null as string | null };
      }
      const raw = (data as { state_code?: string | null } | null)?.state_code ?? null;
      return { state_code: normalizeStateCode(raw) };
    },
  });

  const stateCode = q.data?.state_code ?? null;

  return {
    org: org ?? null,
    orgLoading,
    stateLoading: !!orgId && q.isLoading,
    stateCode,
    catalog: catalogForState(stateCode),
    emptyShellMessage: emptyCatalogShellMessage(stateCode),
  };
}
