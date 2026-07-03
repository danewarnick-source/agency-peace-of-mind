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
  .inputValidator((d: unknown) =>
    z.object({ activeOrganizationId: z.string().uuid().nullable().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ organization_id: string | null; effective: Record<string, boolean>; registry: FeatureRegistryRow[] }> => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("active", true);

    const rank: Record<string, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
    const sorted = [...((memberships ?? []) as Array<{ organization_id: string; role: string }>)]
      .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
    const primary = data.activeOrganizationId
      ? sorted.find((m) => m.organization_id === data.activeOrganizationId) ?? sorted[0]
      : sorted[0];

    const { data: registry } = await supabase
      .from("feature_registry")
      .select("id, feature_key, label, description, parent_key, category, default_enabled, sort_order, required_tier, upgrade_blurb")
      .order("sort_order");
    const reg = (registry ?? []) as FeatureRegistryRow[];

    if (!primary) {
      return {
        organization_id: null,
        effective: Object.fromEntries(reg.map((r) => [r.feature_key, r.default_enabled])),
        registry: reg,
      };
    }

    const { data: overrides } = await supabase
      .from("organization_features")
      .select("feature_key, enabled, updated_by, updated_at")
      .eq("organization_id", primary.organization_id);

    return {
      organization_id: primary.organization_id,
      effective: resolveEffective(reg, (overrides ?? []) as OrgFeatureRow[]),
      registry: reg,
    };
  });

export const requestFeatureUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      featureKey: z.string().min(1),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      };
    })
      .from("feature_upgrade_requests")
      .insert({
        organization_id: data.organizationId,
        feature_key: data.featureKey,
        requested_by: userId,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row!.id };
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

export interface UpgradeRequestRow {
  id: string;
  organization_id: string;
  organization_name: string;
  feature_key: string;
  feature_label: string;
  required_tier: string | null;
  status: "pending" | "approved" | "denied";
  note: string | null;
  requested_by: string;
  requested_by_name: string | null;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
}

async function assertExec(
  supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: unknown) => { eq: (col: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> } } } } },
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("hive_executives")
    .select("user_id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("Forbidden — HIVE executives only");
}

/**
 * List all feature upgrade requests for the exec queue. Joined manually
 * (no PostgREST embedding across auth.users) so profiles/registry come from
 * separate reads then merged in JS.
 */
export const listUpgradeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "denied", "all"]).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<UpgradeRequestRow[]> => {
    const { supabase, userId } = context;
    await assertExec(supabase as never, userId);

    let q = (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o: { ascending: boolean }) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown[] | null }>;
          };
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown[] | null }>;
            };
          };
        };
      };
    }).from("feature_upgrade_requests").select(
      "id, organization_id, feature_key, status, note, requested_by, created_at, resolved_by, resolved_at",
    );
    const filter = data.status ?? "all";
    const chain = filter === "all"
      ? q.order("status", { ascending: true }).order("created_at", { ascending: false })
      : q.eq("status", filter).order("status", { ascending: true }).order("created_at", { ascending: false });
    const { data: rows } = await chain;
    const list = (rows ?? []) as Array<{
      id: string; organization_id: string; feature_key: string; status: string;
      note: string | null; requested_by: string; created_at: string;
      resolved_by: string | null; resolved_at: string | null;
    }>;
    if (list.length === 0) return [];

    const orgIds = [...new Set(list.map((r) => r.organization_id))];
    const featureKeys = [...new Set(list.map((r) => r.feature_key))];
    const userIds = [...new Set(list.map((r) => r.requested_by))];

    const [{ data: orgs }, { data: features }, { data: profiles }] = await Promise.all([
      supabase.from("organizations").select("id, name").in("id", orgIds),
      supabase.from("feature_registry").select("feature_key, label, required_tier").in("feature_key", featureKeys),
      supabase.from("profiles").select("id, full_name, email").in("id", userIds),
    ]);

    const orgMap = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));
    const featMap = new Map(
      ((features ?? []) as Array<{ feature_key: string; label: string; required_tier: string | null }>)
        .map((f) => [f.feature_key, f]),
    );
    const profMap = new Map(
      ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
        .map((p) => [p.id, p.full_name ?? p.email]),
    );

    // Pending first (by status asc: "approved" < "denied" < "pending" — need explicit sort)
    const rank: Record<string, number> = { pending: 0, approved: 1, denied: 2 };
    return list
      .map((r): UpgradeRequestRow => ({
        id: r.id,
        organization_id: r.organization_id,
        organization_name: orgMap.get(r.organization_id) ?? "—",
        feature_key: r.feature_key,
        feature_label: featMap.get(r.feature_key)?.label ?? r.feature_key,
        required_tier: featMap.get(r.feature_key)?.required_tier ?? null,
        status: r.status as "pending" | "approved" | "denied",
        note: r.note,
        requested_by: r.requested_by,
        requested_by_name: profMap.get(r.requested_by) ?? null,
        created_at: r.created_at,
        resolved_by: r.resolved_by,
        resolved_at: r.resolved_at,
      }))
      .sort((a, b) => {
        const s = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
        if (s !== 0) return s;
        return b.created_at.localeCompare(a.created_at);
      });
  });

export const getPendingUpgradeRequestCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { supabase, userId } = context;
    await assertExec(supabase as never, userId);
    const { count } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string, o: { count: "exact"; head: true }) => {
          eq: (c: string, v: string) => Promise<{ count: number | null }>;
        };
      };
    })
      .from("feature_upgrade_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return { count: count ?? 0 };
  });

/**
 * Grant or deny an upgrade request. Grant flips organization_features
 * via the same upsert setOrgFeature performs, then stamps the request row.
 */
export const resolveUpgradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      action: z.enum(["grant", "deny"]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await assertExec(supabase as never, userId);

    const { data: req, error: reqErr } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            single: () => Promise<{ data: { organization_id: string; feature_key: string; status: string } | null; error: unknown }>;
          };
        };
      };
    })
      .from("feature_upgrade_requests")
      .select("organization_id, feature_key, status")
      .eq("id", data.requestId)
      .single();
    if (reqErr || !req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already resolved");

    if (data.action === "grant") {
      // Same write path as Master Controller toggle.
      const { error: featErr } = await supabase
        .from("organization_features")
        .upsert(
          {
            organization_id: req.organization_id,
            feature_key: req.feature_key,
            enabled: true,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,feature_key" },
        );
      if (featErr) throw featErr;
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await (supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: unknown }>;
        };
      };
    })
      .from("feature_upgrade_requests")
      .update({
        status: data.action === "grant" ? "approved" : "denied",
        resolved_by: userId,
        resolved_at: nowIso,
      })
      .eq("id", data.requestId);
    if (updErr) throw updErr;

    // notification seam: fire exec-side email/Slack alert here (Resend rail) once wired.
    return { ok: true };
  });
