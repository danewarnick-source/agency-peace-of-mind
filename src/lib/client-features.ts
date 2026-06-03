import { useDisabledFeatures, type FeatureKey as TierFeatureKey } from "@/hooks/use-tenant-features";

/**
 * Per-client feature keys (stored in clients.feature_config jsonb).
 * Keep in sync with FEATURE_TOGGLES in src/routes/dashboard.clients.tsx.
 */
export type ClientFeatureKey =
  | "daily_notes"
  | "emar"
  | "attendance"
  | "trust_ledger"
  | "incident_forms"
  | "scheduling";

/**
 * Map per-client feature keys → org-level tier keys (use-tenant-features).
 * When a per-client key has a tier counterpart, the tier gate takes precedence.
 */
const TIER_KEY_FOR: Partial<Record<ClientFeatureKey, TierFeatureKey>> = {
  daily_notes: "daily_notes",
  emar: "emar_pass",
  trust_ledger: "pba_trust_ledger",
  // attendance, incident_forms, scheduling: no tier counterpart yet
};

export interface ClientLike {
  feature_config?: Record<string, boolean> | null;
}

/**
 * Decide whether a per-client feature is enabled for the given client.
 *
 * Precedence:
 *   1. Tier first  — if the corresponding tier key is in `disabledTierFeatures`,
 *      the feature is OFF regardless of any per-client toggle.
 *   2. Per-client  — if tier allows it, use client.feature_config[key].
 *   3. Default ON  — if feature_config is null or the key is absent.
 */
export function isClientFeatureEnabled(
  client: ClientLike | null | undefined,
  key: ClientFeatureKey,
  disabledTierFeatures: Set<TierFeatureKey> | null | undefined,
): boolean {
  const tierKey = TIER_KEY_FOR[key];
  if (tierKey && disabledTierFeatures?.has(tierKey)) return false;

  const cfg = client?.feature_config;
  if (!cfg || !(key in cfg)) return true; // default-on
  return cfg[key] !== false;
}

/**
 * Returns whether the feature's tier counterpart (if any) is disabled at the org level.
 * Used by the Settings panel to disable the per-client toggle + show an "upgrade" hint.
 */
export function isFeatureTierDisabled(
  key: ClientFeatureKey,
  disabledTierFeatures: Set<TierFeatureKey> | null | undefined,
): boolean {
  const tierKey = TIER_KEY_FOR[key];
  if (!tierKey) return false;
  return !!disabledTierFeatures?.has(tierKey);
}

/**
 * One-liner React hook: returns { enabled, tierDisabled, loading } for a per-client feature.
 */
export function useClientFeature(
  client: ClientLike | null | undefined,
  key: ClientFeatureKey,
) {
  const { data: disabled, isLoading } = useDisabledFeatures();
  return {
    enabled: isClientFeatureEnabled(client, key, disabled ?? null),
    tierDisabled: isFeatureTierDisabled(key, disabled ?? null),
    loading: isLoading,
  };
}

/**
 * Hook variant that returns the raw disabled-tier set so a component can check
 * multiple features without re-subscribing.
 */
export function useDisabledTierFeatures() {
  return useDisabledFeatures();
}
