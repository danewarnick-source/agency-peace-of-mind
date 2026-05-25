import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export type FeatureKey =
  | "overview" | "time_clock" | "daily_notes" | "scheduler" | "submissions"
  | "audit_portal" | "dspd_controls" | "emar_pass" | "emar_audit"
  | "pba_trust_ledger" | "employees" | "clients" | "teams_homes" | "ai_assistance";

/** Map a pathname to its governing feature key. Returns null when unguarded. */
export function routeToFeatureKey(pathname: string): FeatureKey | null {
  if (pathname === "/dashboard") return "overview";
  if (pathname.startsWith("/dashboard/timeclock")) return "time_clock";
  if (pathname.startsWith("/dashboard/daily-logs")) return "daily_notes";
  if (pathname.startsWith("/dashboard/scheduler")) return "scheduler";
  if (pathname.startsWith("/dashboard/submissions")) return "submissions";
  if (pathname.startsWith("/dashboard/audit-portal")) return "audit_portal";
  if (pathname.startsWith("/dashboard/dspd-controls")) return "dspd_controls";
  if (pathname.startsWith("/dashboard/admin/emar-audit")) return "emar_audit";
  if (pathname.startsWith("/dashboard/emar")) return "emar_pass";
  if (pathname.startsWith("/dashboard/pba-ledger")) return "pba_trust_ledger";
  if (pathname.startsWith("/dashboard/employees")) return "employees";
  if (pathname.startsWith("/dashboard/clients")) return "clients";
  if (pathname.startsWith("/dashboard/teams")) return "teams_homes";
  return null;
}

/** Returns the set of disabled feature keys for the current user's tenant. */
export function useDisabledFeatures() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase();

  return useQuery({
    queryKey: ["tenant-disabled-features", email],
    enabled: !!email,
    queryFn: async (): Promise<Set<FeatureKey>> => {
      const { data: tenant } = await supabase
        .from("provider_tenants")
        .select("id")
        .ilike("owner_email", email!)
        .maybeSingle();
      if (!tenant) return new Set();
      const { data } = await supabase
        .from("tenant_features")
        .select("feature_key, is_enabled")
        .eq("tenant_id", tenant.id)
        .eq("is_enabled", false);
      return new Set((data ?? []).map((r) => r.feature_key as FeatureKey));
    },
  });
}
