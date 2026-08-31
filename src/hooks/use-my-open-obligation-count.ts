import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";
import {
  listMyObligationInstances,
  type MyObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import {
  countStaffObligationsNeedingAttention,
  type ObligationCompletionLite,
} from "@/lib/staff-obligation-attention";
import { supabase } from "@/integrations/supabase/client";

const MY_OBLIGATIONS_KEY = "my-obligation-instances";

/** Staff nav badge — same "needs attention" count as My Obligations All (N). */
export function useMyOpenObligationCount(enabled = true): number {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const listFn = useServerFn(listMyObligationInstances);
  const clientTrainingsFn = useServerFn(getMyClientTrainingStatuses);
  const active = enabled && !!orgId && !!user;

  const { data: instancesRaw = [] } = useQuery<MyObligationInstanceRow[]>({
    queryKey: [MY_OBLIGATIONS_KEY, orgId, user?.id],
    enabled: active,
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
    staleTime: 30_000,
  });
  const instances = Array.isArray(instancesRaw) ? instancesRaw : [];
  const instanceIds = instances.map((row) => row.id);

  const { data: completions = [] } = useQuery<ObligationCompletionLite[]>({
    queryKey: ["my-obligation-completions", orgId, user?.id, instanceIds],
    enabled: active && instanceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_obligation_completions")
        .select("instance_id, nectar_validation_status")
        .eq("staff_id", user!.id)
        .in("instance_id", instanceIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as ObligationCompletionLite[];
    },
    staleTime: 30_000,
  });

  const { data: clientTrainings } = useQuery({
    queryKey: ["my-client-training-statuses", user?.id],
    enabled: active,
    queryFn: () => clientTrainingsFn(),
    staleTime: 60_000,
  });

  return countStaffObligationsNeedingAttention(instances, completions, clientTrainings);
}
