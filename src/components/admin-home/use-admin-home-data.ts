/**
 * Admin Home greeting — org + name + date only.
 * This week cards come from getThisWeek. Dead KPI tiles no longer fetch
 * instance or client rows here.
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { formatDenverLongDate, sessionFirstName } from "@/lib/admin-home-data";

export { greetingWord, sessionFirstName } from "@/lib/admin-home-data";

export function useAdminHomeData() {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";
  const now = useMemo(() => new Date(), []);

  return {
    org,
    orgId,
    orgName,
    orgLoading,
    now,
    firstName: sessionFirstName(user),
    dateLine: formatDenverLongDate(now),
  };
}
