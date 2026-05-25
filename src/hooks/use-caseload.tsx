import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useCurrentOrg } from "./use-org";
import { usePortalView } from "./use-portal-view";

export type CaseloadClient = {
  id: string;
  first_name: string;
  last_name: string;
  home_latitude: number | null;
  home_longitude: number | null;
  pcsp_goals: string[];
  job_code: string[] | null;
  medicaid_id: string | null;
  physical_address: string | null;
};

/**
 * Returns the clients the current STAFF user is assigned to via staff_assignments.
 * Admins/managers see every client in the org.
 */
export function useCaseload() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { view } = usePortalView();
  const role = org?.role;
  const isManagerial = role === "admin" || role === "manager" || role === "super_admin";
  const canSeeWholeOrgCaseload = isManagerial && view === "admin";

  return useQuery({
    enabled: !!user && !!org,
    queryKey: ["caseload", org?.organization_id, user?.id, canSeeWholeOrgCaseload],
    queryFn: async (): Promise<CaseloadClient[]> => {
      if (canSeeWholeOrgCaseload) {
        const { data, error } = await supabase
          .from("clients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id, first_name, last_name, home_latitude, home_longitude, pcsp_goals, job_code, medicaid_id, physical_address" as any)
          .eq("organization_id", org!.organization_id)
          .order("last_name");
        if (error) throw error;
        return (data ?? []) as unknown as CaseloadClient[];
      }
      // Staff: caseload resolver handles direct assignments + group-home override
      // (tenant-scoped via _org; RLS still applies to returned rows).
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "clients_for_staff" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _org: org!.organization_id, _staff: user!.id } as any,
      );
      if (error) throw error;
      const rows = (data ?? []) as unknown as CaseloadClient[];
      // Sort by last name to match prior behavior
      return [...rows].sort((a, b) => (a.last_name ?? "").localeCompare(b.last_name ?? ""));

    },
  });
}
