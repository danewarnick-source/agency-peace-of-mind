import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listClientWeeklyTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; clientId?: string }) =>
    z.object({ organizationId: z.string().uuid(), clientId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("client_weekly_targets")
      .select("*")
      .eq("organization_id", data.organizationId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const upsertClientWeeklyTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    clientId: string;
    serviceCode: string;
    targetHoursPerWeek: number;
    source?: string;
  }) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid(),
    serviceCode: z.string().min(1).max(16),
    targetHoursPerWeek: z.number().min(0).max(168),
    source: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("client_weekly_targets")
      .upsert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        service_code: data.serviceCode.toUpperCase(),
        target_hours_per_week: data.targetHoursPerWeek,
        source: data.source ?? "worksheet",
      }, { onConflict: "client_id,service_code" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteClientWeeklyTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("client_weekly_targets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Sum scheduled (accepted) hours per (clientId, serviceCode) within a week.
 * Used by the host-home DS-hours meter and the warn-when-over-target rule.
 */
export const sumWeeklyScheduledHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; weekStartIso: string; weekEndIso: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      weekStartIso: z.string(),
      weekEndIso: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("scheduled_shifts")
      .select("client_id, service_code, starts_at, ends_at, status")
      .eq("organization_id", data.organizationId)
      .gte("starts_at", data.weekStartIso)
      .lt("starts_at", data.weekEndIso)
      .in("status", ["published", "accepted"]);
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (!r.client_id || !r.service_code) continue;
      const hours = (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 3_600_000;
      const k = `${r.client_id}|${r.service_code.toUpperCase()}`;
      out[k] = (out[k] ?? 0) + hours;
    }
    return out;
  });
