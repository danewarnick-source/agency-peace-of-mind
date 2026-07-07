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
import {
  resolveRequiredQualsForCodes,
  loadStaffQualsBulk,
} from "./required-qualifications.functions";

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

function computeWeeklyTargetPct(
  shifts: Parameters<typeof evaluateShifts>[0],
  targets: Record<string, number>, // key: `${clientId}|${code}`
): Record<string, number> {
  const weekly: Record<string, number> = {};
  for (const s of shifts) {
    if (!s.service_code) continue;
    const key = `${s.client_id}|${s.service_code.toUpperCase()}`;
    const target = targets[key];
    if (!target) continue;
    const hrs = (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000;
    weekly[key] = (weekly[key] ?? 0) + hrs / target;
  }
  return weekly;
}

export const evaluateRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    startIso: string;
    endIso: string;
    locationId?: string;
    targetHoursByClientCode?: Record<string, number>;
  }) => z.object({
    organizationId: z.string().uuid(),
    startIso: z.string(),
    endIso: z.string(),
    locationId: z.string().uuid().optional(),
    targetHoursByClientCode: z.record(z.number()).optional(),
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
    const shiftRows = (shifts ?? []) as Parameters<typeof evaluateShifts>[0];

    // 2) rule settings
    const { data: cfg } = await supabase
      .from("org_shift_behavior_settings")
      .select("rule_settings, ot_threshold_hours")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // 3) staff DOBs + active flags + cert data + client training gaps
    const staffIds = Array.from(new Set(shiftRows.map(s => s.staff_id).filter((x): x is string => !!x)));
    const clientIds = Array.from(new Set(shiftRows.map(s => s.client_id)));
    const serviceCodes = Array.from(new Set(shiftRows.map(s => (s.service_code ?? "").toUpperCase()).filter(Boolean)));

    // Required qualifications per service code — resolved from confirmed
    // staff_prerequisite rules, with the legacy hardcoded map as fallback
    // for any code that has no confirmed rule yet (resolver logs a warning).
    const { perCode: requiredByCode } = await resolveRequiredQualsForCodes(
      supabase,
      data.organizationId,
      serviceCodes,
    );

    const staffCtx: ConflictContext["staff"] = {};
    if (staffIds.length) {
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, active")
        .eq("organization_id", data.organizationId)
        .in("user_id", staffIds);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, date_of_birth")
        .in("id", staffIds);
      const dobById = new Map<string, string | null>(
        (profs ?? []).map((p: any) => [p.id as string, (p.date_of_birth ?? null) as string | null]),
      );

      // Bulk-load namespaced qualifications per staff (external_cert /
      // baseline_training / hive_course / client_specific_training) — matches
      // the kinds expressed in staff_prerequisite rule_definitions.
      const nowIso = new Date().toISOString();
      const qualsByStaff = await loadStaffQualsBulk(
        supabase,
        data.organizationId,
        staffIds,
        nowIso,
      );

      // compute expiredCertCodes: service codes where a required qualification is missing/expired
      const expiredCertCodesByStaff = new Map<string, string[]>();
      for (const staffId of staffIds) {
        const held = qualsByStaff.get(staffId) ?? new Set<string>();
        const missingCodes: string[] = [];
        for (const code of serviceCodes) {
          const required = requiredByCode.get(code) ?? [];
          if (required.length && required.some((q) => !held.has(q.nsKey))) {
            missingCodes.push(code);
          }
        }
        if (missingCodes.length) expiredCertCodesByStaff.set(staffId, missingCodes);
      }


      // client-specific training gaps per staff
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cstRows } = await (supabase as any)
        .from("client_specific_trainings")
        .select("id, client_id")
        .in("client_id", clientIds)
        .eq("organization_id", data.organizationId)
        .eq("status", "published");
      const cstByClient = new Map<string, string[]>();
      for (const r of (cstRows ?? []) as Array<{ id: string; client_id: string }>) {
        const arr = cstByClient.get(r.client_id) ?? [];
        arr.push(r.id);
        cstByClient.set(r.client_id, arr);
      }
      const allCstIds = (cstRows ?? []).map((r: any) => r.id as string);
      const completedByStaff = new Map<string, Set<string>>();
      if (allCstIds.length && staffIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: completions } = await (supabase as any)
          .from("training_completions")
          .select("user_id, ref_id")
          .eq("topic_kind", "person")
          .eq("is_current", true)
          .in("user_id", staffIds)
          .in("ref_id", allCstIds);
        for (const c of (completions ?? []) as Array<{ user_id: string; ref_id: string }>) {
          const set = completedByStaff.get(c.user_id) ?? new Set<string>();
          set.add(c.ref_id);
          completedByStaff.set(c.user_id, set);
        }
      }
      // missingTrainingClientIds: clients for which a staff hasn't completed the published CST
      const missingClientsByStaff = new Map<string, string[]>();
      for (const staffId of staffIds) {
        const completed = completedByStaff.get(staffId) ?? new Set<string>();
        const missingClients: string[] = [];
        for (const [clientId, cstIds] of cstByClient) {
          if (cstIds.some(id => !completed.has(id))) {
            missingClients.push(clientId);
          }
        }
        if (missingClients.length) missingClientsByStaff.set(staffId, missingClients);
      }

      for (const m of (members ?? []) as Array<{ user_id: string; active: boolean }>) {
        staffCtx[m.user_id] = {
          active: !!m.active,
          dob: dobById.get(m.user_id) ?? null,
          expiredCertCodes: expiredCertCodesByStaff.get(m.user_id),
          missingTrainingClientIds: missingClientsByStaff.get(m.user_id),
        };
      }
    }

    // 4) approved time-off in window for these staff → ptoRanges in ctx
    if (staffIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ptoRows } = await (supabase as any)
        .from("time_off_requests")
        .select("staff_id, start_date, end_date, status")
        .eq("organization_id", data.organizationId)
        .eq("status", "approved")
        .in("staff_id", staffIds);
      for (const r of (ptoRows ?? []) as Array<{ staff_id: string; start_date: string; end_date: string }>) {
        const sMs = new Date(r.start_date + "T00:00:00").getTime();
        const eMs = new Date(r.end_date + "T23:59:59.999").getTime();
        const slot = staffCtx[r.staff_id] ?? (staffCtx[r.staff_id] = { active: true });
        (slot.ptoRanges ?? (slot.ptoRanges = [])).push([sMs, eMs]);
      }
    }

    const weeklyTargetPctByClientCode = computeWeeklyTargetPct(
      shiftRows,
      data.targetHoursByClientCode ?? {},
    );

    return evaluateShifts(shiftRows, {
      rules: (cfg?.rule_settings ?? {}) as Partial<Record<PolicyRuleCode, RuleMode>>,
      otThresholdHours: Number(cfg?.ot_threshold_hours ?? 40),
      staff: staffCtx,
      weeklyTargetPctByClientCode,
    });
  });

