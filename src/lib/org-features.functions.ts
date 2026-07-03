import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Organization Master Controller — feature registry + per-org toggles.
 *
 * The `feature_registry` table is the catalog of gatable capabilities in
 * HIVE (top-level tabs today, sub-tabs and NECTAR sub-features later).
 * `organization_features` overlays a per-org on/off setting per key.
 *
 * Resolution: an org's effective feature map = registry.default_enabled
 * unless an explicit organization_features row exists, in which case that
 * row's `enabled` wins.
 *
 * Only HIVE executives can WRITE. Org members can READ their own org's
 * effective feature map (drives sidebar/route gating).
 */

export interface FeatureRegistryRow {
  id: string;
  feature_key: string;
  label: string;
  description: string | null;
  parent_key: string | null;
  category: "tab" | "subtab" | "nectar_feature";
  default_enabled: boolean;
  sort_order: number;
  required_tier: string | null;
  upgrade_blurb: string | null;
}

export interface OrgFeatureRow {
  feature_key: string;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

export interface OrgFeatureBundle {
  registry: FeatureRegistryRow[];
  overrides: OrgFeatureRow[];
  effective: Record<string, boolean>;
}

function resolveEffective(
  registry: FeatureRegistryRow[],
  overrides: OrgFeatureRow[],
): Record<string, boolean> {
  const overrideMap = new Map(overrides.map((o) => [o.feature_key, o.enabled]));
  const eff: Record<string, boolean> = {};
  // First pass — own state.
  for (const r of registry) {
    eff[r.feature_key] = overrideMap.has(r.feature_key)
      ? (overrideMap.get(r.feature_key) as boolean)
      : r.default_enabled;
  }
  // Second pass — parent OFF disables children.
  const byKey = new Map(registry.map((r) => [r.feature_key, r]));
  for (const r of registry) {
    let cursor = r.parent_key;
    while (cursor) {
      if (eff[cursor] === false) {
        eff[r.feature_key] = false;
        break;
      }
      cursor = byKey.get(cursor)?.parent_key ?? null;
    }
  }
  return eff;
}

/**
 * Full bundle for the Master Controller UI (HIVE Exec only).
 */
export const getOrgFeatureBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OrgFeatureBundle> => {
    const { supabase, userId } = context;

    const { data: execRow } = await supabase
      .from("hive_executives")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (!execRow) throw new Error("Forbidden — HIVE executives only");

    const { data: registry } = await supabase
      .from("feature_registry")
      .select("id, feature_key, label, description, parent_key, category, default_enabled, sort_order, required_tier, upgrade_blurb")
      .order("sort_order");

    const { data: overrides } = await supabase
      .from("organization_features")
      .select("feature_key, enabled, updated_by, updated_at")
      .eq("organization_id", data.organizationId);

    const reg = (registry ?? []) as FeatureRegistryRow[];
    const ov = (overrides ?? []) as OrgFeatureRow[];
    return { registry: reg, overrides: ov, effective: resolveEffective(reg, ov) };
  });

/**
 * Effective feature map for the current user's primary org. Used by the
 * client-side gating hook to hide nav / block routes.
 */
export const getMyOrgFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ organization_id: string | null; effective: Record<string, boolean> }> => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("active", true);

    const rank: Record<string, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
    const sorted = [...((memberships ?? []) as Array<{ organization_id: string; role: string }>)]
      .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
    const primary = sorted[0];

    const { data: registry } = await supabase
      .from("feature_registry")
      .select("id, feature_key, label, description, parent_key, category, default_enabled, sort_order, required_tier, upgrade_blurb")
      .order("sort_order");
    const reg = (registry ?? []) as FeatureRegistryRow[];

    if (!primary) {
      return {
        organization_id: null,
        effective: Object.fromEntries(reg.map((r) => [r.feature_key, r.default_enabled])),
      };
    }

    const { data: overrides } = await supabase
      .from("organization_features")
      .select("feature_key, enabled, updated_by, updated_at")
      .eq("organization_id", primary.organization_id);

    return {
      organization_id: primary.organization_id,
      effective: resolveEffective(reg, (overrides ?? []) as OrgFeatureRow[]),
    };
  });

export const setOrgFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      featureKey: z.string().min(1),
      enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: execRow } = await supabase
      .from("hive_executives")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (!execRow) throw new Error("Forbidden — HIVE executives only");

    const { error } = await supabase
      .from("organization_features")
      .upsert(
        {
          organization_id: data.organizationId,
          feature_key: data.featureKey,
          enabled: data.enabled,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,feature_key" },
      );
    if (error) throw error;
    return { ok: true };
  });
