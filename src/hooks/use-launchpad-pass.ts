import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Live Launchpad pass flag for the signed-in staff member.
 *
 * Fail-closed: until the row resolves as `true`, clock-in surfaces must treat
 * the staff as blocked. A query error is also a block — never fail open.
 */
export function useHasPassedLaunchpad() {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["has-passed-launchpad", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("has_passed_launchpad")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data?.has_passed_launchpad;
    },
    staleTime: 30_000,
  });

  const passed = q.data === true;
  const blocked = !passed;
  return {
    passed,
    blocked,
    loading: q.isLoading || q.isFetching,
    error: q.error,
  };
}
