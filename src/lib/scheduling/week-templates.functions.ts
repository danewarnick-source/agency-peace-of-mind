// Week templates: snapshot a week's shifts and replay them onto another week.
// Reuses the new `week_templates` table (id, organization_id, name, payload jsonb).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ShiftSnapshot = {
  staff_id: string | null;
  client_id: string;
  service_code: string | null;
  job_code: string | null;
  // offset (ms) from the week start anchor, preserved on replay
  start_offset_ms: number;
  end_offset_ms: number;
  is_awake_overnight: boolean | null;
  notes: string | null;
  shift_type: string;
};

type WeekPayload = { week_start_iso: string; shifts: ShiftSnapshot[] };

function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday-start to match scheduler
  return x;
}

async function snapshotWeek(
  supabase: any,
  organizationId: string,
  weekStartIso: string,
): Promise<WeekPayload> {
  const start = new Date(weekStartIso);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const { data, error } = await supabase
    .from("scheduled_shifts")
    .select("staff_id, client_id, service_code, job_code, starts_at, ends_at, is_awake_overnight, notes, shift_type")
    .eq("organization_id", organizationId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString());
  if (error) throw error;
  const anchor = start.getTime();
  const shifts: ShiftSnapshot[] = (data ?? []).map((s: any) => ({
    staff_id: s.staff_id ?? null,
    client_id: s.client_id,
    service_code: s.service_code ?? null,
    job_code: s.job_code ?? null,
    start_offset_ms: new Date(s.starts_at).getTime() - anchor,
    end_offset_ms: new Date(s.ends_at).getTime() - anchor,
    is_awake_overnight: s.is_awake_overnight ?? null,
    notes: s.notes ?? null,
    shift_type: s.shift_type ?? "hourly",
  }));
  return { week_start_iso: start.toISOString(), shifts };
}

export const listWeekTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("week_templates")
      .select("id, name, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as Array<{ id: string; name: string; created_at: string }>;
  });

export const saveWeekAsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; weekStartIso: string; name: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      weekStartIso: z.string(),
      name: z.string().min(1).max(120),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = await snapshotWeek(context.supabase, data.organizationId, data.weekStartIso);
    if (payload.shifts.length === 0) throw new Error("No shifts in that week to save.");
    const { data: row, error } = await (context.supabase as any)
      .from("week_templates")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        payload,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, count: payload.shifts.length };
  });

async function materializePayload(
  supabase: any,
  organizationId: string,
  userId: string,
  payload: WeekPayload,
  targetWeekStartIso: string,
) {
  const target = weekStart(new Date(targetWeekStartIso)).getTime();
  const inserts = payload.shifts.map((s) => ({
    organization_id: organizationId,
    staff_id: s.staff_id,
    client_id: s.client_id,
    service_code: s.service_code,
    job_code: s.job_code,
    shift_type: s.shift_type,
    starts_at: new Date(target + s.start_offset_ms).toISOString(),
    ends_at: new Date(target + s.end_offset_ms).toISOString(),
    is_awake_overnight: s.is_awake_overnight,
    notes: s.notes,
    status: s.staff_id ? "draft" : "open",
    published: false,
    created_by: userId,
    created_from: "template",
  }));
  if (inserts.length === 0) return { count: 0 };
  const { gateScheduledShiftInsert } = await import("./shift-commit");
  await gateScheduledShiftInsert(supabase, inserts as never, { mode: "bulk_auto", userId });
  const { error } = await supabase.from("scheduled_shifts").insert(inserts);
  if (error) throw error;
  return { count: inserts.length };
}

export const applyWeekTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; templateId: string; targetWeekStartIso: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      templateId: z.string().uuid(),
      targetWeekStartIso: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("week_templates")
      .select("payload")
      .eq("id", data.templateId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Template not found");
    return materializePayload(
      context.supabase, data.organizationId, context.userId,
      row.payload as WeekPayload, data.targetWeekStartIso,
    );
  });

export const copyPreviousWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; targetWeekStartIso: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      targetWeekStartIso: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const target = weekStart(new Date(data.targetWeekStartIso));
    const prev = new Date(target); prev.setDate(prev.getDate() - 7);
    const payload = await snapshotWeek(context.supabase, data.organizationId, prev.toISOString());
    if (payload.shifts.length === 0) throw new Error("Previous week has no shifts to copy.");
    return materializePayload(
      context.supabase, data.organizationId, context.userId,
      payload, target.toISOString(),
    );
  });

export const deleteWeekTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; templateId: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      templateId: z.string().uuid(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("week_templates")
      .delete()
      .eq("id", data.templateId)
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return { ok: true };
  });
