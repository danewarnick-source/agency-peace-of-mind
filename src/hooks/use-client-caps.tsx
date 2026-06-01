import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Money-free view of a client's billing-code caps. Used by the staff
 * caseload utilization bars. NEVER contains rate_per_unit, dollar
 * authorizations, or any reimbursement figures — staff roles must not
 * see the company's billing rates.
 */
export type ClientCap = {
  id: string;
  client_id: string;
  service_code: string;
  unit_type: string;
  monthly_max_units: number | null;
  weekly_cap_units: number | null;
};

export function useClientCaps(clientId: string | undefined) {
  return useQuery({
    enabled: !!clientId,
    queryKey: ["client-caps", clientId],
    queryFn: async (): Promise<ClientCap[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .rpc("get_client_caps" as any, { _client_id: clientId! });
      if (error) throw error;
      return (data ?? []) as unknown as ClientCap[];
    },
  });
}
