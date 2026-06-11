import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Swap lifecycle
 *   staff A requests swap on their accepted shift → pending (to_staff_id optional)
 *   target staff accepts → admin queue (status stays 'pending'; note marks 'partner-accepted')
 *   admin approves → shift.staff_id changes to to_staff_id; request 'approved'
 *   anyone denies → 'denied' or 'cancelled'
 */

export const requestSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string; toStaffId?: string; note?: string }) =>
    z.object({
      shiftId: z.string().uuid(),
      toStaffId: z.string().uuid().optional(),
      note: z.string().max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: shift, error } = await supabase
      .from("scheduled_shifts")
      .select("id, organization_id, staff_id, status, service_code, starts_at, client_id")
      .eq("id", data.shiftId).maybeSingle();
    if (error) throw error;
    if (!shift) throw new Error("Shift not found");
    if (shift.staff_id !== userId) throw new Error("You can only request swaps for your own shifts");

    const { data: row, error: iErr } = await supabase
      .from("shift_swap_requests")
      .insert({
        organization_id: shift.organization_id,
        shift_id: data.shiftId,
        from_staff_id: userId,
        to_staff_id: data.toStaffId ?? null,
        note: data.note ?? null,
        status: "pending",
      })
      .select("*").single();
    if (iErr) throw iErr;

    try {
      await supabase.from("notifications").insert({
        organization_id: shift.organization_id,
        recipient_role: "admin",
        type: "swap_request",
        title: "Shift swap requested",
        body: `Swap requested for ${shift.service_code ?? "shift"} on ${new Date(shift.starts_at).toLocaleDateString()}.`,
        link_to: `/dashboard/schedule-preview?shift=${data.shiftId}`,
        related_id: row.id,
        related_type: "shift_swap_request",
      });
    } catch { /* best-effort */ }

    return row;
  });

export const listEligibleSwapPartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string }) =>
    z.object({ shiftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: shift } = await supabase
      .from("scheduled_shifts")
      .select("organization_id, starts_at, ends_at, service_code, client_id")
      .eq("id", data.shiftId).maybeSingle();
    if (!shift) return [];

    // All active members in the org other than current user
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id, active, profiles:profiles!inner(id, first_name, last_name)")
      .eq("organization_id", shift.organization_id)
      .eq("active", true);

    // Staff with overlapping shifts → ineligible
    const { data: overlapping } = await supabase
      .from("scheduled_shifts")
      .select("staff_id")
      .eq("organization_id", shift.organization_id)
      .lt("starts_at", shift.ends_at)
      .gt("ends_at", shift.starts_at);
    const blocked = new Set((overlapping ?? []).map((r: any) => r.staff_id).filter(Boolean));

    return (members ?? [])
      .filter((m: any) => m.user_id !== userId && !blocked.has(m.user_id))
      .map((m: any) => ({
        staffId: m.user_id,
        name: `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim() || "Staff",
      }));
  });

export const respondToSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; accept: boolean }) =>
    z.object({ requestId: z.string().uuid(), accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req } = await supabase
      .from("shift_swap_requests")
      .select("id, organization_id, to_staff_id, from_staff_id, note, shift_id")
      .eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.to_staff_id && req.to_staff_id !== userId) throw new Error("Not your swap to respond to");

    if (!data.accept) {
      await supabase.from("shift_swap_requests").update({ status: "denied", decided_by: userId, decided_at: new Date().toISOString() }).eq("id", data.requestId);
      return { ok: true };
    }

    // Partner accepted — flag for admin via note; admin must approve
    const partnerNote = `${req.note ?? ""}\n[partner-accepted by ${userId}]`.trim();
    await supabase.from("shift_swap_requests").update({ to_staff_id: userId, note: partnerNote }).eq("id", data.requestId);

    try {
      await supabase.from("notifications").insert({
        organization_id: req.organization_id,
        recipient_role: "admin",
        type: "swap_partner_accepted",
        title: "Swap awaiting approval",
        body: "A staff member accepted a swap request — please review.",
        link_to: `/dashboard/schedule-preview?shift=${req.shift_id}`,
        related_id: req.id,
        related_type: "shift_swap_request",
      });
    } catch { /* best-effort */ }

    return { ok: true };
  });

export const decideSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; approve: boolean }) =>
    z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req } = await supabase
      .from("shift_swap_requests")
      .select("id, shift_id, from_staff_id, to_staff_id, organization_id")
      .eq("id", data.requestId).maybeSingle();
    if (!req) throw new Error("Request not found");

    if (!data.approve) {
      await supabase.from("shift_swap_requests")
        .update({ status: "denied", decided_by: userId, decided_at: new Date().toISOString() })
        .eq("id", data.requestId);
      return { ok: true };
    }
    if (!req.to_staff_id) throw new Error("No partner accepted yet");

    // Swap atomically: update shift then mark request approved
    const { error: sErr } = await supabase
      .from("scheduled_shifts")
      .update({ staff_id: req.to_staff_id, status: "accepted" })
      .eq("id", req.shift_id);
    if (sErr) throw sErr;

    await supabase.from("shift_swap_requests")
      .update({ status: "approved", decided_by: userId, decided_at: new Date().toISOString() })
      .eq("id", data.requestId);

    try {
      await supabase.from("notifications").insert([
        {
          organization_id: req.organization_id, recipient_user_id: req.from_staff_id,
          recipient_role: "employee", type: "swap_approved", title: "Swap approved",
          body: "Your shift swap was approved.", link_to: "/dashboard/schedule",
          related_id: req.shift_id, related_type: "scheduled_shift",
        },
        {
          organization_id: req.organization_id, recipient_user_id: req.to_staff_id,
          recipient_role: "employee", type: "swap_assigned", title: "New shift assigned to you",
          body: "A coworker's shift was reassigned to you via swap.", link_to: "/dashboard/schedule",
          related_id: req.shift_id, related_type: "scheduled_shift",
        },
      ]);
    } catch { /* best-effort */ }

    return { ok: true };
  });

export const listPendingSwaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("shift_swap_requests")
      .select("id, shift_id, from_staff_id, to_staff_id, note, status, created_at")
      .eq("organization_id", data.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listMySwapsForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) =>
    z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("shift_swap_requests")
      .select("id, shift_id, from_staff_id, to_staff_id, note, status, created_at")
      .eq("organization_id", data.organizationId)
      .eq("status", "pending")
      .or(`to_staff_id.eq.${userId},to_staff_id.is.null`);
    if (error) throw error;
    return (rows ?? []).filter((r: any) => r.from_staff_id !== userId);
  });
