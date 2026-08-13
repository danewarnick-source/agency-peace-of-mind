import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";

/** Active (is_active=true) service codes configured for the org — the Settings > Service Codes catalog. */
export function useOrgActiveServiceCodes(): { codes: Set<string>; isLoading: boolean } {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["org-active-service-codes", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("service_codes" as any)
        .select("code, is_active")
        .eq("organization_id", orgId!)
        .eq("is_active", true);
      if (error) throw error;
      return new Set((data ?? []).map((r: { code: string }) => r.code.toUpperCase()));
    },
  });
  return { codes: q.data ?? new Set<string>(), isLoading: q.isLoading };
}
