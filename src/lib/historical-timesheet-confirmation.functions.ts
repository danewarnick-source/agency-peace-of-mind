// Stage 4 of the historical-timesheets import workflow.
//
// These functions are the ONLY path a staff member has to interact with
// entries the admin submitted to them from a historical import. Every fn:
//   • runs as the signed-in user (`requireSupabaseAuth`)
//   • filters by `staff_id = context.userId` — a staff member can NEVER see
//     or touch another staff member's rows
//   • requires the row to be `import_source='historical_import'` AND
//     `status='Pending_Staff_Confirmation'` — nothing else is editable via
//     this surface (finalized rows are locked; live punches are unrelated)
//
// Confirmation flips status to 'Approved' and stamps who/when. The
// historical markers (`import_source`, `shift_entry_type`, `import_job_id`)
// are NEVER cleared, so the entry remains permanently identifiable as an
// imported historical record.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PENDING = "Pending_Staff_Confirmation";
const HISTORICAL = "historical_import";

export const listMyPendingHistoricalTimesheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("evv_timesheets")
      .select(
        "id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, shift_note_text, staff_flagged, staff_flag_reason, import_job_id, created_at, clients:clients!inner(id, first_name, last_name)",
      )
      .eq("staff_id", userId)
      .eq("import_source", HISTORICAL)
      .eq("status", PENDING)
      .order("clock_in_timestamp", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const countMyPendingHistoricalTimesheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const { count, error } = await supabase
      .from("evv_timesheets")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", userId)
      .eq("import_source", HISTORICAL)
      .eq("status", PENDING);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

// Guard helper: verify the row exists, belongs to the caller, and is still
// in the pending-confirmation state. Returns the row on success, throws
// otherwise. Every mutating fn below uses this so we never rely on RLS alone
// to block cross-staff writes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOwnPendingRow(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from("evv_timesheets")
    .select("id, staff_id, status, import_source")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Timesheet entry not found.");
  if (data.staff_id !== userId) throw new Error("You can only act on your own entries.");
  if (data.import_source !== HISTORICAL) throw new Error("Only historical-import entries can be confirmed here.");
  if (data.status !== PENDING) throw new Error("This entry is no longer pending confirmation.");
  return data;
}

export const updateMyHistoricalTimesheetNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; note: string }) =>
    z.object({
      id: z.string().uuid(),
      note: z.string().max(4000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    await assertOwnPendingRow(supabase, userId, data.id);
    const trimmed = data.note.trim();
    const { error } = await supabase
      .from("evv_timesheets")
      .update({ shift_note_text: trimmed.length > 0 ? trimmed : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const flagMyHistoricalTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason: string }) =>
    z.object({
      id: z.string().uuid(),
      reason: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    await assertOwnPendingRow(supabase, userId, data.id);
    const { error } = await supabase
      .from("evv_timesheets")
      .update({ staff_flagged: true, staff_flag_reason: data.reason.trim() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMyHistoricalTimesheetFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    await assertOwnPendingRow(supabase, userId, data.id);
    const { error } = await supabase
      .from("evv_timesheets")
      .update({ staff_flagged: false, staff_flag_reason: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmMyHistoricalTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    await assertOwnPendingRow(supabase, userId, data.id);
    const nowIso = new Date().toISOString();
    // Confirm flips status → Approved. Historical markers are intentionally
    // NOT cleared: the entry remains permanently distinguishable from a live
    // clock punch, forever.
    const { error } = await supabase
      .from("evv_timesheets")
      .update({
        status: "Approved",
        staff_confirmed_at: nowIso,
        staff_confirmed_by: userId,
        // Confirming resolves any prior flag the staff member set.
        staff_flagged: false,
        staff_flag_reason: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
