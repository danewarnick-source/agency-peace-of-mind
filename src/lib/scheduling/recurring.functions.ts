// Recurring shift patterns: weekly templates that materialize into scheduled_shifts.
// Idempotent — won't create duplicates if the same pattern/date/start already exists.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PatternInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
  service_code_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
  rotation_group_id: z.string().uuid().nullable().optional(),
  weekday_mask: z.number().int().min(0).max(127),
  start_time_local: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time_local: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  effective_from: z.string(),       // YYYY-MM-DD
  effective_until: z.string().nullable().optional(),
  name: z.string().max(160).nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export const listPatterns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("recurring_shift_patterns")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertPattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PatternInput.parse(d))
  .handler(async ({ data, context }) => {
    const crosses = data.end_time_local <= data.start_time_local;
    const row = {
      ...data,
      crosses_midnight: crosses,
      created_by: context.userId,
    };
    const sb = context.supabase as any;
    if (data.id) {
      const { error } = await sb.from("recurring_shift_patterns").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: ins, error } = await sb.from("recurring_shift_patterns")
      .insert(row).select("id").single();
    if (error) throw error;
    return { id: ins.id as string };
  });

export const togglePattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("recurring_shift_patterns").update({ active: data.active }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deletePattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("recurring_shift_patterns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─── Rotation groups (lightweight CRUD) ──────────────────────────────────
export const listRotationGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: groups, error } = await sb
      .from("staff_rotation_groups")
      .select("id, name, last_assigned_staff_id, members:staff_rotation_group_members(staff_id, sort_order)")
      .eq("organization_id", data.organizationId)
      .order("name");
    if (error) throw error;
    return groups ?? [];
  });

export const upsertRotationGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; organizationId: string; name: string; memberIds: string[] }) =>
    z.object({
      id: z.string().uuid().optional(),
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(120),
      memberIds: z.array(z.string().uuid()),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let groupId = data.id;
    if (groupId) {
      const { error } = await sb.from("staff_rotation_groups")
        .update({ name: data.name }).eq("id", groupId);
      if (error) throw error;
      await sb.from("staff_rotation_group_members").delete().eq("group_id", groupId);
    } else {
      const { data: ins, error } = await sb.from("staff_rotation_groups")
        .insert({ organization_id: data.organizationId, name: data.name })
        .select("id").single();
      if (error) throw error;
      groupId = ins.id as string;
    }
    if (data.memberIds.length) {
      const rows = data.memberIds.map((sid, i) => ({
        group_id: groupId, staff_id: sid, sort_order: i,
      }));
      const { error } = await sb.from("staff_rotation_group_members").insert(rows);
      if (error) throw error;
    }
    return { id: groupId! };
  });

// ─── Materialize a target week ───────────────────────────────────────────
function parseHHMM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return { h, m: m ?? 0 };
}

function weekStart(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

async function pickRotationStaff(sb: any, groupId: string): Promise<string | null> {
  const { data: g } = await sb.from("staff_rotation_groups")
    .select("id, last_assigned_staff_id, members:staff_rotation_group_members(staff_id, sort_order)")
    .eq("id", groupId).maybeSingle();
  if (!g || !g.members?.length) return null;
  const ordered = [...g.members].sort((a: any, b: any) => a.sort_order - b.sort_order).map((m: any) => m.staff_id);
  const lastIx = g.last_assigned_staff_id ? ordered.indexOf(g.last_assigned_staff_id) : -1;
  const next = ordered[(lastIx + 1) % ordered.length];
  await sb.from("staff_rotation_groups").update({ last_assigned_staff_id: next }).eq("id", groupId);
  return next;
}

export const materializeWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; weekStartIso: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      weekStartIso: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const target = weekStart(new Date(data.weekStartIso));
    const weekEnd = new Date(target); weekEnd.setDate(weekEnd.getDate() + 7);

    const { data: patterns, error } = await sb
      .from("recurring_shift_patterns")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("active", true);
    if (error) throw error;
    if (!patterns?.length) return { created: 0, skipped: 0 };

    // Existing shifts in target week (for idempotency)
    const { data: existing } = await sb
      .from("scheduled_shifts")
      .select("client_id, service_code, starts_at, ends_at, staff_id")
      .eq("organization_id", data.organizationId)
      .gte("starts_at", target.toISOString())
      .lt("starts_at", weekEnd.toISOString());
    const existingKey = new Set<string>(
      (existing ?? []).map((s: any) =>
        `${s.client_id}|${s.starts_at}|${s.ends_at}`)
    );

    // Resolve service code rows once
    const codeIds = Array.from(new Set(patterns.map((p: any) => p.service_code_id).filter(Boolean)));
    let codeMap = new Map<string, string>();
    if (codeIds.length) {
      const { data: codes } = await sb.from("service_codes")
        .select("id, code").in("id", codeIds);
      codeMap = new Map((codes ?? []).map((c: any) => [c.id, c.code]));
    }

    const inserts: any[] = [];
    let skipped = 0;
    for (const p of patterns as any[]) {
      const effFrom = new Date(p.effective_from + "T00:00:00");
      const effUntil = p.effective_until ? new Date(p.effective_until + "T23:59:59") : null;
      const startHM = parseHHMM(p.start_time_local);
      const endHM = parseHHMM(p.end_time_local);

      for (let dow = 0; dow < 7; dow++) {
        if (!(p.weekday_mask & (1 << dow))) continue;
        const day = new Date(target); day.setDate(day.getDate() + dow);
        if (day < effFrom) continue;
        if (effUntil && day > effUntil) continue;

        const starts = new Date(day); starts.setHours(startHM.h, startHM.m, 0, 0);
        const ends = new Date(day); ends.setHours(endHM.h, endHM.m, 0, 0);
        if (ends <= starts) ends.setDate(ends.getDate() + 1); // overnight

        const code = p.service_code_id ? codeMap.get(p.service_code_id) ?? null : null;
        const key = `${p.client_id}|${starts.toISOString()}|${ends.toISOString()}`;
        if (existingKey.has(key)) { skipped++; continue; }

        let staffId: string | null = p.staff_id ?? null;
        if (!staffId && p.rotation_group_id) {
          staffId = await pickRotationStaff(sb, p.rotation_group_id);
        }

        inserts.push({
          organization_id: p.organization_id,
          client_id: p.client_id,
          service_code: code,
          staff_id: staffId,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          shift_type: "hourly",
          status: staffId ? "draft" : "open",
          published: false,
          created_by: context.userId,
          created_from: "recurring",
          notes: p.notes ?? null,
        });
        existingKey.add(key);
      }
    }

    if (inserts.length === 0) return { created: 0, skipped };
    // Compliance gate — raise open flags per bundle; bulk expansions proceed.
    const { gateScheduledShiftInsert } = await import("./shift-commit");
    await gateScheduledShiftInsert(sb, inserts as never, { mode: "bulk_auto", userId: context.userId });
    const { error: insErr } = await sb.from("scheduled_shifts").insert(inserts);
    if (insErr) throw insErr;
    return { created: inserts.length, skipped };
  });
