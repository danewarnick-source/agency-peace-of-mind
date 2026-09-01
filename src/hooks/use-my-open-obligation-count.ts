import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listMyObligationInstances,
  type MyObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import { isUnlinkedFormDuty } from "@/lib/resolve-obligation-form";
import { isPackSentinel, obligationIsRequired } from "@/lib/obligation-packs";

const MY_OBLIGATIONS_KEY = "my-obligation-instances";

/** Pending or overdue duties assigned to the signed-in staff member. */
export function useMyOpenObligationCount(): number {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const listFn = useServerFn(listMyObligationInstances);

  const { data: instancesRaw = [] } = useQuery<MyObligationInstanceRow[]>({
    queryKey: [MY_OBLIGATIONS_KEY, orgId, user?.id],
    enabled: !!orgId && !!user,
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
    staleTime: 30_000,
  });

  const instances = Array.isArray(instancesRaw) ? instancesRaw : [];
  return instances.filter(
    (row) =>
      (row.status === "pending" || row.status === "overdue") &&
      !isUnlinkedFormDuty(row.obligation) &&
      !isPackSentinel(row.obligation) &&
      obligationIsRequired(row.obligation),
  ).length;
}
