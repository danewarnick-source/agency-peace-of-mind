import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Staff response to a published shift. Writes status and, on decline, files an
// admin notification + appends the reason to the shift notes field.
export const respondToShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    shiftId: string;
    response: "accepted" | "declined";
    declineReason?: string;
  }) => z.object({
    shiftId: z.string().uuid(),
    response: z.enum(["accepted", "declined"]),
    declineReason: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: shift, error: rErr } = await supabase
      .from("scheduled_shifts")
      .select("id, organization_id, staff_id, client_id, starts_at, ends_at, service_code, notes")
      .eq("id", data.shiftId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!shift) throw new Error("Shift not found");
    if (shift.staff_id !== userId) throw new Error("Not your shift");

    const patch: Record<string, unknown> = { status: data.response };
    if (data.response === "declined" && data.declineReason) {
      const prefix = shift.notes ? shift.notes + "\n" : "";
      patch.notes = `${prefix}Declined: ${data.declineReason}`;
    }
    const { error: uErr } = await supabase
      .from("scheduled_shifts").update(patch).eq("id", data.shiftId);
    if (uErr) throw uErr;

    if (data.response === "declined") {
      const startLabel = new Date(shift.starts_at).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
      await supabase.from("notifications").insert({
        organization_id: shift.organization_id,
        recipient_role: "admin",
        type: "shift_declined",
        urgency: "urgent",
        title: `Shift declined — ${shift.service_code ?? "shift"} · ${startLabel}`,
        body: data.declineReason || "Staff declined the published shift.",
        link_to: "/dashboard/schedule-preview",
        related_id: shift.id,
        related_type: "shift_decline",
      });
    }
    return { ok: true };
  });

// Publish a batch of draft shifts. Sets status + notifies each affected staff
// member with a single per-publish notification covering their assignment count.
export const publishShiftsWithNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("scheduled_shifts")
      .select("id, organization_id, staff_id")
      .in("id", data.ids);
    if (error) throw error;

    const { error: uErr } = await supabase
      .from("scheduled_shifts")
      .update({ status: "published", published: true })
      .in("id", data.ids);
    if (uErr) throw uErr;

    // Group by staff for one notification per recipient.
    const byStaff = new Map<string, { orgId: string; count: number; firstId: string }>();
    for (const r of rows ?? []) {
      if (!r.staff_id) continue;
      const cur = byStaff.get(r.staff_id);
      if (cur) cur.count++;
      else byStaff.set(r.staff_id, { orgId: r.organization_id, count: 1, firstId: r.id });
    }
    const inserts = Array.from(byStaff.entries()).map(([staffId, info]) => ({
      organization_id: info.orgId,
      recipient_role: "staff" as const,
      recipient_user_id: staffId,
      type: "shifts_published",
      urgency: "normal",
      title: info.count === 1
        ? "A new shift was published for you"
        : `${info.count} shifts were published for you`,
      body: "Open your schedule to accept or decline.",
      link_to: "/dashboard/schedule",
      related_id: info.firstId,
      related_type: "scheduled_shift",
    }));
    if (inserts.length > 0) {
      await supabase.from("notifications").insert(inserts);
    }
    return { ok: true, count: data.ids.length, notified: inserts.length };
  });

// Pulls the "Action needed" feed for admins: declined published shifts +
// pending swap requests, scoped to the org and a date range.
export const getActionNeeded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string; startIso: string; endIso: string }) =>
    z.object({
      organizationId: z.string().uuid(),
      startIso: z.string(),
      endIso: z.string(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [declines, swaps, openShifts] = await Promise.all([
      supabase.from("scheduled_shifts")
        .select("id, staff_id, client_id, starts_at, ends_at, service_code, notes")
        .eq("organization_id", data.organizationId)
        .eq("status", "declined")
        .gte("starts_at", data.startIso)
        .lt("starts_at", data.endIso)
        .order("starts_at"),
      supabase.from("shift_swap_requests")
        .select("id, shift_id, from_staff_id, to_staff_id, note, created_at")
        .eq("organization_id", data.organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("scheduled_shifts")
        .select("id, client_id, starts_at, ends_at, service_code")
        .eq("organization_id", data.organizationId)
        .eq("status", "open")
        .gte("starts_at", data.startIso)
        .lt("starts_at", data.endIso)
        .order("starts_at"),
    ]);
    return {
      declines: declines.data ?? [],
      swaps: swaps.data ?? [],
      openShifts: openShifts.data ?? [],
    };
  });
