import { useDisabledFeatures, type FeatureKey as TierFeatureKey } from "@/hooks/use-tenant-features";

// ─── Code-driven feature areas (DSPD SOW catalog) ─────────────────────────
//
// A client's authorized service codes determine which feature AREAS apply
// to them. No Behavior Consultation codes → no behavior surfaces; no
// supported-employment codes → no SE surfaces; etc. Per-client
// `feature_config[<feature>]` overrides the code-derived default in either
// direction (admin force-on or force-off).

export const FEATURE_CODES = {
  behavior:             ["BC1", "BC2", "BC3"],
  med_monitoring:       ["PM1", "PM2", "PN1", "PN2"],
  supported_employment: ["SEI", "SEC", "SED", "SEE", "SJD", "SJP", "SJR", "EPR"],
  day_support:          ["DSI", "DSG", "DSP"],
  host_home:            ["HHS", "PPS"],
  residential:          ["RHS", "ELS", "SLH"],
  respite:              ["RP2", "RP3", "RP4", "RP5", "RPS"],
  companion_personal:   ["COM", "PAC", "HSQ"],
  budget_assistance:    ["PBA"],
  transportation:       ["MTP"],
} as const;

export type ClientCodeFeature = keyof typeof FEATURE_CODES;

/** True if the client's authorized DSPD codes include any code for `feature`. */
export function clientHasFeature(
  authorizedCodes: readonly string[] | null | undefined,
  feature: ClientCodeFeature,
): boolean {
  const codes = (authorizedCodes ?? []).map((c) => String(c).toUpperCase());
  return (FEATURE_CODES[feature] ?? []).some((c) => codes.includes(c));
}

/**
 * Final visibility for a code-driven feature on a given client.
 * Per-client `feature_config[feature]` ALWAYS wins over the code-derived
 * default (true → force on, false → force off). When unset, fall back to
 * whether the client's authorized codes include the feature.
 */
export function clientFeatureVisible(
  client: { feature_config?: Record<string, boolean> | null; authorized_dspd_codes?: readonly string[] | null } | null | undefined,
  feature: ClientCodeFeature,
): boolean {
  const override = client?.feature_config?.[feature];
  if (typeof override === "boolean") return override;
  return clientHasFeature(client?.authorized_dspd_codes ?? null, feature);
}


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
