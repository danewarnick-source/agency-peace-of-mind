import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  firstLoginProgress,
  type FirstLoginCounts,
} from "@/lib/first-login-setup";

const EMPTY_COUNTS: FirstLoginCounts = {
  memberCount: 0,
  clientCount: 0,
  shiftCount: 0,
};

async function countExact(table: "organization_members" | "clients" | "scheduled_shifts", orgId: string) {
  let q = (supabase as any)
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (table === "organization_members") {
    q = q.eq("active", true);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export function useFirstLoginSetup() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["first-login-setup", orgId],
    queryFn: async (): Promise<FirstLoginCounts> => {
      const [memberCount, clientCount, shiftCount] = await Promise.all([
        countExact("organization_members", orgId!),
        countExact("clients", orgId!),
        countExact("scheduled_shifts", orgId!),
      ]);
      return { memberCount, clientCount, shiftCount };
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const counts = q.data ?? EMPTY_COUNTS;
  const progress = firstLoginProgress(counts);

  return {
    orgId,
    orgLoading,
    countsReady: q.isSuccess,
    countsFailed: q.isError,
    countsLoading: !!orgId && !q.isSuccess && !q.isError,
    counts,
    ...progress,
    refetch: q.refetch,
  };
}
