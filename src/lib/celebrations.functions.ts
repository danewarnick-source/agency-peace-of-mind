import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

const OrgInput = z.object({ organizationId: z.string().uuid() });

export type CelebrationTier = 1 | 2 | 3;

export type CelebrationPayload = Record<string, string | number | boolean | null>;

export type ActiveCelebration = {
  id: string;
  organizationId: string;
  eventKey: string;
  tier: CelebrationTier;
  scopeUserId: string | null;
  payload: CelebrationPayload;
  createdAt: string;
};

export type OrgCelebrationSettings = {
  enabled: boolean;
  tier1Enabled: boolean;
  tier2Enabled: boolean;
  tier3Enabled: boolean;
};

const FireInput = z.object({
  organizationId: z.string().uuid(),
  eventKey: z.string().min(1).max(120),
  scopeUserId: z.string().uuid().nullable().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

/** Idempotent insert; returns whether the celebration actually fired. */
export const fireCelebration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => FireInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("celebration_events")
      .insert({
        organization_id: data.organizationId,
        event_key: data.eventKey,
        scope_user_id: data.scopeUserId ?? null,
        tier: data.tier,
        payload: data.payload ?? {},
      })
      .select("id")
      .maybeSingle();
    // duplicate key → 23505 means already fired
    if (error) {
      if ((error.code as string) === "23505") return { fired: false, id: null as string | null };
      return { fired: false, id: null };
    }
    return { fired: true, id: (row?.id as string | undefined) ?? null };
  });

/** Returns unacknowledged celebrations for the current user. */
export const listActiveCelebrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = context.userId as string;

    // Mute check
    const { data: mute } = await sb
      .from("user_celebration_mute")
      .select("muted")
      .eq("user_id", userId)
      .maybeSingle();
    if (mute?.muted) return { celebrations: [] as ActiveCelebration[], settings: null };

    const { data: settings } = await sb
      .from("org_celebration_settings")
      .select("enabled, tier1_enabled, tier2_enabled, tier3_enabled")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (settings && settings.enabled === false) {
      return { celebrations: [] as ActiveCelebration[], settings: null };
    }

    // last 7 days, not yet acknowledged by user
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: events } = await sb
      .from("celebration_events")
      .select("id, organization_id, event_key, scope_user_id, tier, payload, created_at")
      .eq("organization_id", data.organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    const ids = (events ?? []).map((e: { id: string }) => e.id);
    let ackedIds = new Set<string>();
    if (ids.length > 0) {
      const { data: acks } = await sb
        .from("celebration_acknowledgements")
        .select("event_id")
        .eq("user_id", userId)
        .in("event_id", ids);
      ackedIds = new Set((acks ?? []).map((a: { event_id: string }) => a.event_id));
    }

    const tierAllowed = (t: number) => {
      if (!settings) return true;
      if (t === 1) return settings.tier1_enabled !== false;
      if (t === 2) return settings.tier2_enabled !== false;
      if (t === 3) return settings.tier3_enabled !== false;
      return true;
    };

    const celebrations: ActiveCelebration[] = (events ?? [])
      .filter((e: { id: string; tier: number; scope_user_id: string | null }) => {
        if (ackedIds.has(e.id)) return false;
        if (!tierAllowed(e.tier)) return false;
        // Per-user events only show for that user.
        if (e.scope_user_id && e.scope_user_id !== userId) return false;
        return true;
      })
      .map((e: {
        id: string; organization_id: string; event_key: string;
        scope_user_id: string | null; tier: CelebrationTier; payload: CelebrationPayload | null;
        created_at: string;
      }) => ({
        id: e.id,
        organizationId: e.organization_id,
        eventKey: e.event_key,
        tier: e.tier,
        scopeUserId: e.scope_user_id,
        payload: (e.payload ?? {}) as CelebrationPayload,
        createdAt: e.created_at,
      }));

    return { celebrations, settings: settings ?? null };
  });

export const acknowledgeCelebration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ eventId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = context.userId as string;
    await sb
      .from("celebration_acknowledgements")
      .insert({ event_id: data.eventId, user_id: userId })
      .select("id")
      .maybeSingle();
    return { ok: true };
  });

/**
 * Lightweight server-side scan that detects newly-met achievement conditions
 * and fires the corresponding celebration events (idempotently).
 */
export const evaluateCelebrationTriggers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const orgId = data.organizationId;
    const fired: string[] = [];

    const safeFire = async (
      eventKey: string,
      tier: CelebrationTier,
      scopeUserId: string | null,
      payload: Record<string, unknown>,
    ) => {
      const { error } = await sb.from("celebration_events").insert({
        organization_id: orgId,
        event_key: eventKey,
        scope_user_id: scopeUserId,
        tier,
        payload,
      });
      if (!error) fired.push(eventKey);
    };

    // ----- Onboarding: first ever staff member fully onboarded (org-scope, tier 3) -----
    try {
      const { count: completedMembers } = await sb
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("active", true);
      if ((completedMembers ?? 0) >= 1) {
        await safeFire("onboarding.first_completed", 3, null, { count: completedMembers ?? 0 });
      }
    } catch { /* ignore */ }

    // ----- Per-user training fully complete (tier 1) -----
    try {
      const { data: assignments } = await sb
        .from("course_assignments")
        .select("user_id, status")
        .eq("organization_id", orgId);
      const byUser = new Map<string, { total: number; done: number }>();
      for (const a of (assignments ?? []) as Array<{ user_id: string; status: string }>) {
        const cur = byUser.get(a.user_id) ?? { total: 0, done: 0 };
        cur.total += 1;
        if (a.status === "completed") cur.done += 1;
        byUser.set(a.user_id, cur);
      }
      for (const [uid, v] of byUser.entries()) {
        if (v.total > 0 && v.done === v.total) {
          await safeFire(`training.completed:${uid}`, 1, uid, { total: v.total });
        }
      }

      // Team milestone: 100% completion across the org → tier 2
      const totals = [...byUser.values()];
      if (totals.length >= 3 && totals.every((v) => v.total > 0 && v.done === v.total)) {
        await safeFire("training.org_full_completion", 2, null, { staff: totals.length });
      }
    } catch { /* ignore */ }

    // ----- Compliance threshold: 100% staff credentials current → tier 2 -----
    try {
      const { count: activeStaff } = await sb
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("active", true);
      const { count: expiring } = await sb
        .from("external_certifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .lte("expires_at", new Date().toISOString());
      if ((activeStaff ?? 0) >= 3 && (expiring ?? 0) === 0) {
        await safeFire("compliance.threshold_100", 2, null, { staff: activeStaff });
      }
    } catch { /* ignore */ }

    // ----- Cert renewed early (per user, tier 1) -----
    try {
      const last30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: renewed } = await sb
        .from("external_certifications")
        .select("user_id, cert_name, reviewed_at, expires_at")
        .eq("organization_id", orgId)
        .eq("status", "approved")
        .gte("reviewed_at", last30);
      for (const c of (renewed ?? []) as Array<{
        user_id: string; cert_name: string | null; reviewed_at: string | null; expires_at: string | null;
      }>) {
        if (!c.reviewed_at || !c.expires_at) continue;
        const reviewed = new Date(c.reviewed_at).getTime();
        const expires = new Date(c.expires_at).getTime();
        // "Early" = renewed at least 14 days before expiry
        if (expires - reviewed > 14 * 86_400_000) {
          await safeFire(`cert.renewed_early:${c.user_id}:${c.cert_name ?? "cert"}`, 1, c.user_id, {
            cert: c.cert_name,
          });
        }
      }
    } catch { /* ignore */ }

    return { fired };
  });

export const getCelebrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row } = await sb
      .from("org_celebration_settings")
      .select("enabled, tier1_enabled, tier2_enabled, tier3_enabled")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const userId = context.userId as string;
    const { data: muteRow } = await sb
      .from("user_celebration_mute")
      .select("muted")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      org: {
        enabled: row?.enabled ?? true,
        tier1Enabled: row?.tier1_enabled ?? true,
        tier2Enabled: row?.tier2_enabled ?? true,
        tier3Enabled: row?.tier3_enabled ?? true,
      } satisfies OrgCelebrationSettings,
      userMuted: !!muteRow?.muted,
    };
  });

export const setCelebrationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      enabled: z.boolean(),
      tier1Enabled: z.boolean(),
      tier2Enabled: z.boolean(),
      tier3Enabled: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireOrgMembership(context.supabase, context.userId, data.organizationId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb
      .from("org_celebration_settings")
      .upsert({
        organization_id: data.organizationId,
        enabled: data.enabled,
        tier1_enabled: data.tier1Enabled,
        tier2_enabled: data.tier2Enabled,
        tier3_enabled: data.tier3Enabled,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserCelebrationMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ muted: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const userId = context.userId as string;
    const { error } = await sb
      .from("user_celebration_mute")
      .upsert({ user_id: userId, muted: data.muted, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
