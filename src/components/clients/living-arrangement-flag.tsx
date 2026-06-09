import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { AlertTriangle } from "lucide-react";

type ServiceCodeMini = { code: string; is_living_arrangement: boolean };

/**
 * Advisory-only flag. A client should have exactly one code where
 * is_living_arrangement is true (RHS / HHS / PPS / SLH / SLN). If more than
 * one is assigned, surface a soft warning — never block, never auto-remove.
 */
export function LivingArrangementFlag({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const { data: catalog = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["service-catalog-mini", orgId],
    queryFn: async (): Promise<ServiceCodeMini[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("service_codes" as any)
        .select("code,is_living_arrangement")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return ((data ?? []) as unknown) as ServiceCodeMini[];
    },
    staleTime: 60_000,
  });

  const { data: assigned = [] } = useQuery({
    enabled: !!orgId && !!clientId,
    queryKey: ["client-assigned-codes", orgId, clientId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("service_code")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []).map((r) => r.service_code);
    },
  });

  const livingSet = new Set(
    catalog.filter((c) => c.is_living_arrangement).map((c) => c.code),
  );
  const clientLiving = assigned.filter((c) => livingSet.has(c));
  if (clientLiving.length < 2) return null;

  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-xs">
        <p className="font-semibold">Living-arrangement conflict (advisory)</p>
        <p className="mt-0.5">
          This client is assigned to {clientLiving.length} living-arrangement codes
          ({clientLiving.join(", ")}). A client should have exactly one of RHS,
          HHS, PPS, SLH, or SLN. Review and remove the extras when convenient —
          nothing is blocked.
        </p>
      </div>
    </div>
  );
}
