import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { getMyOrgFeatures, type FeatureRegistryRow } from "@/lib/org-features.functions";

const KNOWN_GATED_FEATURES = new Set([
  "hive_training",
  "nectar",
  "state_audit",
  "pba_ledgers",
  "evv_timesheets",
  "client_intake",
  "pcsp",
  "staff_onboarding",
]);

/**
 * Single client-side gate for the Organization Master Controller.
 *
 * Reads the current user's org's effective feature map (registry defaults
 * overlaid with per-org overrides set by HIVE Executives). Use with the
 * `feature` field on nav items to lock tabs, and inside route
 * components to block access.
 */
export function useOrgFeatures() {
  const { session } = useAuth();
  const { data: currentOrg, isLoading: orgLoading } = useCurrentOrg();
  const fn = useServerFn(getMyOrgFeatures);
  const q = useQuery({
    queryKey: ["my-org-features", session?.user?.id ?? "anon", currentOrg?.organization_id ?? null],
    enabled: !!session?.user?.id && !orgLoading,
    queryFn: () =>
      fn({
        data: {
          activeOrganizationId: currentOrg?.organization_id ?? null,
        },
      }),
    staleTime: 30_000,
  });
  const effective = q.data?.effective ?? {};
  const registry = q.data?.registry ?? [];
  const registryByKey: Record<string, FeatureRegistryRow> = Object.fromEntries(
    registry.map((r) => [r.feature_key, r]),
  );
  return {
    loading: q.isLoading,
    effective,
    registry,
    registryByKey,
    organizationId: q.data?.organization_id ?? null,
    /** Unknown feature keys stay open; known/registered gates fail closed until the org-scoped read resolves. */
    isEnabled: (key: string | undefined | null) => {
      if (!key) return true;
      const meta = registryByKey[key];
      if (meta) return effective[key] ?? meta.default_enabled;
      if (q.isLoading || q.isError || !q.data) return !KNOWN_GATED_FEATURES.has(key);
      return true;
    },
    /** registry metadata for the upgrade bubble */
    getMeta: (key: string | undefined | null) => (key ? registryByKey[key] ?? null : null),
  };
}

export function useFeatureEnabled(featureKey: string | undefined | null): boolean {
  const { isEnabled } = useOrgFeatures();
  return isEnabled(featureKey);
}
