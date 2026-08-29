import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { billingCodesForLiveClients } from "@/lib/billing-codes-live-clients";

export type ClientBillingCode = {
  id: string;
  organization_id: string;
  client_id: string;
  service_code: string;
  unit_type: string;
  rate_per_unit: number;
  annual_unit_authorization: number;
  monthly_max_units: number | null;
  weekly_cap_units: number | null;
  service_start_date: string | null;
  service_end_date: string | null;
  sce: string | null;
  provider_approver_email: string | null;
};

/** Returns the authorized billing codes for a single client. */
export function useClientBillingCodes(clientId: string | undefined) {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!org?.organization_id && !!clientId,
    queryKey: ["client-billing-codes", org?.organization_id, clientId],
    queryFn: async (): Promise<ClientBillingCode[]> => {
      // Two queries, join in JS. Skip codes if the clients row is gone.
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", org!.organization_id)
        .eq("id", clientId!)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) return [];

      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_billing_codes" as any)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .eq("client_id", clientId!)
        .order("service_code");
      if (error) throw error;
      // Only currently-open authorizations. Soft-closed rows
      // (service_end_date <= today) are excluded so removed codes disappear
      // from the editor, profile summary, EVV clock-in dropdown, scheduler,
      // and cap modal. Billing history reads use their own query.
      const today = new Date().toISOString().slice(0, 10);
      const rows = (data ?? []) as unknown as ClientBillingCode[];
      return rows.filter((r) => !r.service_end_date || r.service_end_date > today);
    },
  });
}

/** All billing codes for the org — used by admin editors and the 520 view. */
export function useAllClientBillingCodes() {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["all-client-billing-codes", org?.organization_id, "live-clients"],
    queryFn: async (): Promise<ClientBillingCode[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_billing_codes" as any)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("client_id")
        .order("service_code");
      if (error) throw error;
      const rows = (data ?? []) as unknown as ClientBillingCode[];
      if (!rows.length) return [];
      // Hide codes whose client_id has no clients row. Do not delete them.
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", org!.organization_id);
      if (clientsError) throw clientsError;
      return billingCodesForLiveClients(
        rows,
        (clients ?? []).map((c) => c.id),
      );
    },
  });
}
