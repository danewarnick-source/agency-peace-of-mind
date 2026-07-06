import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Open shifts = scheduled_shifts where staff_id IS NULL and status='open'.
 * Lifecycle:
 *   admin posts → status='open'
 *   staff claims → status='pending', claim_requested_by = userId (staff_id still NULL)
 *   admin approves → status='accepted', staff_id = claim_requested_by, claim_requested_by NULL
 *   admin denies → status='open', claim_requested_by NULL
 */

export const listOpenShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    startIso: string;
    endIso: string;
  }) => z.object({
    organizationId: z.string().uuid(),
    startIso: z.string(),
    endIso: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("scheduled_shifts")
      .select("id, organization_id, client_id, service_code, starts_at, ends_at, location_id, notes, status, claim_requested_by")
      .eq("organization_id", data.organizationId)
      .in("status", ["open", "pending"])
      .is("staff_id", null)
      .gte("starts_at", data.startIso)
      .lt("starts_at", data.endIso)
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const postOpenShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organizationId: string;
    clientId: string;
    serviceCode: string;
    startsAtIso: string;
    endsAtIso: string;
    locationId?: string | null;
    notes?: string;
  }) => z.object({
    organizationId: z.string().uuid(),
    clientId: z.string().uuid(),
    serviceCode: z.string().min(1),
    startsAtIso: z.string(),
    endsAtIso: z.string(),
    locationId: z.string().uuid().nullable().optional(),
    notes: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const insertRow = {
      organization_id: data.organizationId,
      staff_id: null,
      client_id: data.clientId,
      service_code: data.serviceCode.toUpperCase(),
      job_code: data.serviceCode.toUpperCase(),
      starts_at: data.startsAtIso,
      ends_at: data.endsAtIso,
      location_id: data.locationId ?? null,
      notes: data.notes ?? null,
      status: "open",
      published: true,
      shift_type: "hourly",
      created_from: "manual",
    };
    const { gateScheduledShiftInsert } = await import("@/lib/scheduling/shift-commit");
    await gateScheduledShiftInsert(context.supabase, [insertRow as never], { mode: "bulk_auto", userId: context.userId });
    const { data: row, error } = await context.supabase
      .from("scheduled_shifts")
      .insert(insertRow)
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const claimOpenShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string }) =>
    z.object({ shiftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: shift, error: gErr } = await supabase
      .from("scheduled_shifts")
      .select("id, organization_id, status, staff_id, client_id, starts_at, service_code")
      .eq("id", data.shiftId).maybeSingle();
    if (gErr) throw gErr;
    if (!shift) throw new Error("Shift not found");
    if (shift.staff_id) throw new Error("Shift is already assigned");
    if (shift.status !== "open") throw new Error("Shift is not open for claim");

    const { error: uErr } = await supabase
      .from("scheduled_shifts")
      .update({ status: "pending", claim_requested_by: userId })
      .eq("id", data.shiftId);
    if (uErr) throw uErr;

    // Notify admins (best-effort): role-targeted notification
    try {
      await supabase.from("notifications").insert({
        organization_id: shift.organization_id,
        recipient_role: "admin",
        type: "shift_claim_request",
        title: "Open shift claimed",
        body: `A staff member requested to claim ${shift.service_code ?? "an open shift"} on ${new Date(shift.starts_at).toLocaleDateString()}.`,
        link_to: `/dashboard/schedule-preview?shift=${data.shiftId}`,
        related_id: data.shiftId,
        related_type: "scheduled_shift",
      });
    } catch { /* best-effort */ }

    return { ok: true };
  });

export const decideClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shiftId: string; approve: boolean }) =>
    z.object({ shiftId: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: shift, error: gErr } = await supabase
      .from("scheduled_shifts")
      .select("id, organization_id, claim_requested_by, service_code, starts_at")
      .eq("id", data.shiftId).maybeSingle();
    if (gErr) throw gErr;
    if (!shift) throw new Error("Shift not found");
    if (!shift.claim_requested_by) throw new Error("No pending claim on this shift");

    const claimant = shift.claim_requested_by;

    const patch = data.approve
      ? { status: "accepted", staff_id: claimant, claim_requested_by: null }
      : { status: "open", claim_requested_by: null };

    const { error: uErr } = await supabase
      .from("scheduled_shifts")
      .update(patch)
      .eq("id", data.shiftId);
    if (uErr) throw uErr;

    try {
      await supabase.from("notifications").insert({
        recipient_user_id: claimant,
        recipient_role: "employee",
        organization_id: shift.organization_id,
        type: data.approve ? "shift_claim_approved" : "shift_claim_denied",
        title: data.approve ? "Claim approved" : "Claim denied",
        body: data.approve
          ? `Your claim for ${shift.service_code ?? "the open shift"} on ${new Date(shift.starts_at).toLocaleDateString()} was approved.`
          : `Your claim for ${shift.service_code ?? "the open shift"} was not approved.`,
        link_to: `/dashboard/schedule`,
        related_id: data.shiftId,
        related_type: "scheduled_shift",
      });
    } catch { /* best-effort */ }

    return { ok: true };
  });
