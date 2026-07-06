// Scheduler server functions for the new code-section scheduler at
// /dashboard/scheduler. All writes go through `requireSupabaseAuth` so RLS
// is enforced as the calling user. Validation rules (caseload, time-off,
// authorized code) match the product spec for the rebuilt scheduler.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ShiftInput = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid().nullable(),
  client_id: z.string().uuid(),
  job_code: z.string().min(1),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  shift_type: z.string().default("hourly"),
  status: z.string().default("pending"),
  published: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});
export type ShiftInput = z.infer<typeof ShiftInput>;

async function assertClientAuthorizedForCode(
  supabase: any,
  orgId: string,
  clientId: string,
  code: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("client_billing_codes")
    .select("id, service_end_date")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .eq("service_code", code);
  if (error) throw error;
  const open = (data ?? []).some(
    (r: { service_end_date: string | null }) =>
      !r.service_end_date || r.service_end_date > today,
  );
  if (!open) {
    throw new Error(
      `Client isn't authorized for ${code}. Add the code on the client profile first.`,
    );
  }
}

async function assertStaffOnCaseload(
  supabase: any,
  orgId: string,
  staffId: string,
  clientId: string,
  staffName: string,
  clientName: string,
) {
  const { data, error } = await supabase
    .from("staff_assignments")
    .select("id")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      `You can't schedule this — ${staffName} isn't authorized to work with ${clientName}.`,
    );
  }
}

async function assertStaffNotOnTimeOff(
  supabase: any,
  orgId: string,
  staffId: string,
  startsAt: string,
  staffName: string,
) {
  const day = startsAt.slice(0, 10);
  const { data, error } = await supabase
    .from("time_off_requests")
    .select("id")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("status", "approved")
    .lte("start_date", day)
    .gte("end_date", day)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new Error(`${staffName} is off that day.`);
}

export const saveShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ShiftInput) => ShiftInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    await assertClientAuthorizedForCode(
      supabase,
      data.organization_id,
      data.client_id,
      data.job_code,
    );

    if (data.staff_id) {
      // Resolve names for friendlier errors
      const [{ data: client }, { data: staff }] = await Promise.all([
        supabase
          .from("clients")
          .select("first_name, last_name")
          .eq("id", data.client_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("first_name, last_name, full_name")
          .eq("id", data.staff_id)
          .maybeSingle(),
      ]);
      const staffName =
        (staff?.full_name && String(staff.full_name).trim()) ||
        [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim() ||
        "That staff member";
      const clientName =
        [client?.first_name, client?.last_name].filter(Boolean).join(" ").trim() ||
        "this client";

      await assertStaffOnCaseload(
        supabase,
        data.organization_id,
        data.staff_id,
        data.client_id,
        staffName,
        clientName,
      );
      await assertStaffNotOnTimeOff(
        supabase,
        data.organization_id,
        data.staff_id,
        data.starts_at,
        staffName,
      );
    }

    const payload = {
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      client_id: data.client_id,
      job_code: data.job_code,
      service_code: data.job_code,
      shift_type: data.shift_type,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      status: data.status,
      published: data.published,
      notes: data.notes?.trim() || null,
      created_by: userId,
    };

    if (data.id) {
      const { error } = await supabase
        .from("scheduled_shifts")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.organization_id);
      if (error) throw error;
      return { id: data.id };
    }
    const { gateScheduledShiftInsert } = await import("@/lib/scheduling/shift-commit");
    await gateScheduledShiftInsert(supabase, [payload as never], { mode: "bulk_auto", userId });
    const { data: row, error } = await supabase
      .from("scheduled_shifts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; organization_id: string }) =>
    z.object({ id: z.string().uuid(), organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("scheduled_shifts")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

export const publishWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; week_start_iso: string }) =>
    z.object({
      organization_id: z.string().uuid(),
      week_start_iso: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const start = new Date(data.week_start_iso);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data: rows, error } = await supabase
      .from("scheduled_shifts")
      .update({ published: true, status: "published" })
      .eq("organization_id", data.organization_id)
      .eq("published", false)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .not("staff_id", "is", null)
      .select("id, staff_id");
    if (error) throw error;
    const byStaff = new Map<string, number>();
    for (const r of rows ?? []) {
      const sid = (r as any).staff_id as string | null;
      if (!sid) continue;
      byStaff.set(sid, (byStaff.get(sid) ?? 0) + 1);
    }
    if (byStaff.size > 0) {
      const weekLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const notifs = Array.from(byStaff.entries()).map(([staffId, count]) => ({
        organization_id: data.organization_id,
        recipient_role: "staff",
        recipient_user_id: staffId,
        type: "shift_published",
        urgency: "normal",
        title: "Your schedule was published",
        body: `You have ${count} new or updated shift${count === 1 ? "" : "s"} for the week of ${weekLabel}.`,
        link_to: "/dashboard/schedule",
      }));
      await supabase.from("notifications").insert(notifs);
    }
    return { shifts: rows?.length ?? 0, staff: byStaff.size };
  });

export const addToCaseload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; staff_id: string; client_id: string }) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      client_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    // Idempotent — unique (staff_id, client_id)
    const { error } = await supabase
      .from("staff_assignments")
      .upsert(
        {
          organization_id: data.organization_id,
          staff_id: data.staff_id,
          client_id: data.client_id,
        },
        { onConflict: "staff_id,client_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    return { ok: true };
  });

export const removeFromCaseload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; staff_id: string; client_id: string }) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      client_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("staff_assignments")
      .delete()
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("client_id", data.client_id);
    if (error) throw error;
    return { ok: true };
  });

export const setAdminTimeOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { organization_id: string; staff_id: string; date: string; on: boolean }) =>
      z.object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        date: z.string().min(8),
        on: z.boolean(),
      }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (data.on) {
      // Insert an approved single-day time off (admin-initiated).
      const { error } = await supabase.from("time_off_requests").insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        start_date: data.date,
        end_date: data.date,
        type: "pto",
        status: "approved",
        decided_by: userId,
        decided_at: new Date().toISOString(),
        note: "Admin-marked from scheduler",
      });
      if (error) throw error;
    } else {
      // Remove approved single-day rows that exactly cover this date.
      const { error } = await supabase
        .from("time_off_requests")
        .delete()
        .eq("organization_id", data.organization_id)
        .eq("staff_id", data.staff_id)
        .eq("start_date", data.date)
        .eq("end_date", data.date)
        .eq("status", "approved");
      if (error) throw error;
    }
    return { ok: true };
  });

export const saveAdminHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { organization_id: string; client_id: string; hours: number | null }) =>
      z.object({
        organization_id: z.string().uuid(),
        client_id: z.string().uuid(),
        hours: z.number().min(0).max(168).nullable(),
      }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("clients")
      .update({ admin_hours_per_week: data.hours })
      .eq("id", data.client_id)
      .eq("organization_id", data.organization_id);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// Day Program
// ============================================================

export const saveDayProgramSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    organization_id: string;
    session_date: string;
    service_code: "DSG" | "DSP";
    location_label: string | null;
    start_time: string;
    end_time: string;
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      organization_id: z.string().uuid(),
      session_date: z.string().min(8),
      service_code: z.enum(["DSG", "DSP"]),
      location_label: z.string().nullable(),
      start_time: z.string().min(1),
      end_time: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    if (data.id) {
      const { error } = await supabase
        .from("day_program_sessions")
        .update({
          session_date: data.session_date,
          service_code: data.service_code,
          location_label: data.location_label,
          start_time: data.start_time,
          end_time: data.end_time,
        })
        .eq("id", data.id)
        .eq("organization_id", data.organization_id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("day_program_sessions")
      .insert({
        organization_id: data.organization_id,
        session_date: data.session_date,
        service_code: data.service_code,
        location_label: data.location_label,
        start_time: data.start_time,
        end_time: data.end_time,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    session_id: string;
    client_id: string;
    attended: boolean;
  }) =>
    z.object({
      session_id: z.string().uuid(),
      client_id: z.string().uuid(),
      attended: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("day_program_attendance")
      .upsert(
        {
          session_id: data.session_id,
          client_id: data.client_id,
          attended: data.attended,
        },
        { onConflict: "session_id,client_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const addSessionStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string; staff_id: string }) =>
    z.object({
      session_id: z.string().uuid(),
      staff_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase
      .from("day_program_session_staff")
      .upsert(
        { session_id: data.session_id, staff_id: data.staff_id },
        { onConflict: "session_id,staff_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    return { ok: true };
  });
