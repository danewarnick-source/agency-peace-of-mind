import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateShifts,
  type Conflict,
  type ConflictContext,
  type RuleMode,
  type PolicyRuleCode,
} from "./conflicts";

// ---------- Rule settings (per-org) ----------

export const getRuleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("org_shift_behavior_settings")
      .select("rule_settings, ot_threshold_hours")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw error;
    return {
      ruleSettings: (row?.rule_settings ?? {}) as Partial<Record<PolicyRuleCode, RuleMode>>,
      otThresholdHours: Number(row?.ot_threshold_hours ?? 40),
    };
  });

export const updateRuleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    ruleSettings: Record<string, RuleMode>;
    otThresholdHours: number;
  }) => z.object({
    organizationId: z.string().uuid(),
    ruleSettings: z.record(z.enum(["off", "warn", "block"])),
    otThresholdHours: z.number().min(0).max(168),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("org_shift_behavior_settings")
      .upsert({
        organization_id: data.organizationId,
        rule_settings: data.ruleSettings,
        ot_threshold_hours: data.otThresholdHours,
      }, { onConflict: "organization_id" });
    if (error) throw error;
    return { ok: true };
  });

// ---------- Conflict evaluation over a range ----------

export const evaluateRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    startIso: string;
    endIso: string;
    locationId?: string;
  }) => z.object({
    organizationId: z.string().uuid(),
    startIso: z.string(),
    endIso: z.string(),
    locationId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<Conflict[]> => {
    const { supabase } = context;

    // 1) shifts in range
    let q = supabase
      .from("scheduled_shifts")
      .select("id, staff_id, client_id, service_code, starts_at, ends_at, parent_shift_id, is_awake_overnight, status, override_reason")
      .eq("organization_id", data.organizationId)
      .gte("starts_at", data.startIso)
      .lt("starts_at", data.endIso);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: shifts, error } = await q;
    if (error) throw error;
    const shiftRows = (shifts ?? []) as ConflictContext["staff"] extends never ? never : Parameters<typeof evaluateShifts>[0];

    // 2) rule settings
    const { data: cfg } = await supabase
      .from("org_shift_behavior_settings")
      .select("rule_settings, ot_threshold_hours")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // 3) staff DOBs + active flags
    const staffIds = Array.from(new Set(shiftRows.map(s => s.staff_id))).filter(Boolean);
    const staffCtx: ConflictContext["staff"] = {};
    if (staffIds.length) {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, active, profiles:profiles!inner(id, date_of_birth)")
        .eq("organization_id", data.organizationId)
        .in("user_id", staffIds);
      for (const m of members ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = (m as any).profiles;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const id = (p?.id ?? (m as any).user_id) as string;
        staffCtx[id] = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          active: !!(m as any).active,
          dob: p?.date_of_birth ?? null,
        };
      }
    }

    return evaluateShifts(shiftRows, {
      rules: (cfg?.rule_settings ?? {}) as Partial<Record<PolicyRuleCode, RuleMode>>,
      otThresholdHours: Number(cfg?.ot_threshold_hours ?? 40),
      staff: staffCtx,
    });
  });
