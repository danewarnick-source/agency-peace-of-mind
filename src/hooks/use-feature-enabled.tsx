import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getMyOrgFeatures } from "@/lib/org-features.functions";

/**
 * Single client-side gate for the Organization Master Controller.
 *
 * Reads the current user's org's effective feature map (registry defaults
 * overlaid with per-org overrides set by HIVE Executives). Use with the
 * `feature` field on nav items to hide/disable tabs, and inside route
 * components to block access.
 */
export function useOrgFeatures() {
  const { session } = useAuth();
  const fn = useServerFn(getMyOrgFeatures);
  const q = useQuery({
    queryKey: ["my-org-features", session?.user?.id ?? "anon"],
    enabled: !!session?.user?.id,
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const effective = q.data?.effective ?? {};
  return {
    loading: q.isLoading,
    effective,
    /** true if the feature is enabled OR unknown (unknown = not in registry yet → don't block) */
    isEnabled: (key: string | undefined | null) => (key ? effective[key] !== false : true),
  };
}

export function useFeatureEnabled(featureKey: string | undefined | null): boolean {
  const { isEnabled } = useOrgFeatures();
  return isEnabled(featureKey);
}
