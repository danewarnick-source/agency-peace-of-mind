import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOverridesForOrg,
  listOverridesForStaff,
  type ObligationOverrideView,
} from "@/lib/obligations/remediation.functions";

export function useStaffOverrides(organizationId: string | null, staffId: string | null) {
  const listFn = useServerFn(listOverridesForStaff);
  return useQuery({
    enabled: !!organizationId && !!staffId,
    queryKey: ["obligation-overrides", organizationId, staffId],
    queryFn: () =>
      listFn({
        data: { organizationId: organizationId!, staffId: staffId! },
      }) as Promise<ObligationOverrideView[]>,
    staleTime: 30_000,
  });
}

export function useOrgOverrides(organizationId: string | null, enabled = true) {
  const listFn = useServerFn(listOverridesForOrg);
  return useQuery({
    enabled: !!organizationId && enabled,
    queryKey: ["obligation-overrides-org", organizationId],
    queryFn: () =>
      listFn({ data: { organizationId: organizationId! } }) as Promise<ObligationOverrideView[]>,
    staleTime: 30_000,
  });
}
