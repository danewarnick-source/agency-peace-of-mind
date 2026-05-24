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
      // Staff: restrict to assignments
      const { data: rows, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("staff_assignments" as any)
        .select("client_id")
        .eq("organization_id", org!.organization_id)
        .eq("staff_id", user!.id);
      if (error) throw error;
      const ids = ((rows ?? []) as unknown as { client_id: string }[]).map((r) => r.client_id);
      if (!ids.length) return [];
      const { data, error: e2 } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, home_latitude, home_longitude, pcsp_goals, job_code, medicaid_id, physical_address" as any)
        .eq("organization_id", org!.organization_id)
        .in("id", ids)
        .order("last_name");
      if (e2) throw e2;
      return (data ?? []) as unknown as CaseloadClient[];
    },
  });
}
