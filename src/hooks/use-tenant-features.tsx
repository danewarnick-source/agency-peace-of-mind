import { useQuery } from "@tanstack/react-query";

export type FeatureKey =
  | "overview" | "daily_notes"
  | "dspd_controls" | "emar_pass" | "emar_audit"
  | "pba_trust_ledger" | "employees" | "clients" | "teams_homes" | "ai_assistance";

/**
 * Legacy provider_tenants / tenant_features flags. That catalog is unused
 * (0 rows on Hive-Platform). Client feature visibility is driven by DSPD
 * codes + clients.feature_config — see client-features.ts.
 */
export function useDisabledFeatures() {
  return useQuery({
    queryKey: ["tenant-disabled-features"],
    queryFn: async (): Promise<Set<FeatureKey>> => new Set(),
    staleTime: Infinity,
  });
}
