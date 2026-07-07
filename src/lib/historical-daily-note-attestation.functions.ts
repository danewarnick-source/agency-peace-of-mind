// Stage 4 of the historical daily-notes import workflow.
//
// Staff-facing fns act as the signed-in user (`requireSupabaseAuth`) and are
// filtered by `user_id = context.userId` so a staff member can NEVER see or
// touch another staff member's rows. Only rows with
// `import_source='historical_import'` AND `status='pending_staff_attestation'`
// are addressable here. Signing one note flips ONLY that note to 'approved'
// — never a batch.
//
// The admin proxy fn is separate: it lets an org admin/manager attest on
// behalf of a former staff member who no longer has platform access. Those
// rows are permanently labeled `attested_on_behalf=true` with the reason and
// the admin's user id captured — they are NEVER re-labeled as if the staff
// member signed themselves.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PENDING = "pending_staff_attestation";
const APPROVED = "approved";
const HISTORICAL = "historical_import";

export const listMyPendingHistoricalDailyNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("daily_logs")
      .select(
        "id, client_id, log_date, narrative, pcsp_goals_addressed, import_job_id, created_at, clients:clients!inner(id, first_name, last_name)",
      )
      .eq("user_id", userId)
      .eq("import_source", HISTORICAL)
      .eq("status", PENDING)
      .order("log_date", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const updateMyHistoricalDailyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; narrative: string; pcsp_goals_addressed?: string[] }) =>
    z.object({
      id: z.string().uuid(),
      narrative: z.string().min(1).max(8000),
      pcsp_goals_addressed: z.array(z.string().max(500)).max(50).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const patch: Record<string, unknown> = { narrative: data.narrative };
    if (data.pcsp_goals_addressed) patch.pcsp_goals_addressed = data.pcsp_goals_addressed;
    const { error } = await supabase
      .from("daily_logs")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("import_source", HISTORICAL)
      .eq("status", PENDING);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const attestMyHistoricalDailyNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; narrative?: string; pcsp_goals_addressed?: string[] }) =>
    z.object({
      id: z.string().uuid(),
      narrative: z.string().min(1).max(8000).optional(),
      pcsp_goals_addressed: z.array(z.string().max(500)).max(50).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: APPROVED,
      approved_at: now,
      approved_by: userId,
      staff_attested_at: now,
      staff_attested_by: userId,
    };
    if (data.narrative) patch.narrative = data.narrative;
    if (data.pcsp_goals_addressed) patch.pcsp_goals_addressed = data.pcsp_goals_addressed;
    const { error } = await supabase
      .from("daily_logs")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("import_source", HISTORICAL)
      .eq("status", PENDING);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Admin proxy attestation ──────────────────────────────────────────────
// Used ONLY when the staff member who wrote the note no longer works at the
// organization and has no platform access. The row is permanently labeled as
// admin-attested — never presented as if the original staff signed it.
export const listFormerStaffHistoricalDailyNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    // Admin/manager check.
    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: data.organization_id,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Only admins or managers may attest on behalf of a former staff member.");

    // Pull pending historical notes for this org, plus current active org
    // memberships. A staff_id absent from the active membership set is
    // treated as a "former staff, no platform access" candidate.
    const [notesRes, membersRes] = await Promise.all([
      supabase
        .from("daily_logs")
        .select(
          "id, user_id, client_id, log_date, narrative, pcsp_goals_addressed, import_job_id, created_at, clients:clients!inner(id, first_name, last_name)",
        )
        .eq("organization_id", data.organization_id)
        .eq("import_source", HISTORICAL)
        .eq("status", PENDING)
        .order("log_date", { ascending: true }),
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
    ]);
    if (notesRes.error) throw new Error(notesRes.error.message);
    if (membersRes.error) throw new Error(membersRes.error.message);
    const active = new Set((membersRes.data ?? []).map((m: { user_id: string }) => m.user_id));
    const formerRows = (notesRes.data ?? []).filter((r: { user_id: string }) => !active.has(r.user_id));
    return { rows: formerRows };
  });

export const adminAttestHistoricalDailyNoteOnBehalf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; organization_id: string; reason: string }) =>
    z.object({
      id: z.string().uuid(),
      organization_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: data.organization_id,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Only admins or managers may attest on behalf of a former staff member.");

    // Confirm the row is still pending and belongs to this org + a
    // now-inactive staff member. We fetch first so the admin sees an
    // explicit failure if state has changed under them.
    const { data: row, error: rowErr } = await supabase
      .from("daily_logs")
      .select("id, user_id, organization_id, import_source, status")
      .eq("id", data.id)
      .single();
    if (rowErr) throw new Error(rowErr.message);
    if (row.organization_id !== data.organization_id) throw new Error("Row is not in this organization.");
    if (row.import_source !== HISTORICAL) throw new Error("Row is not a historical import.");
    if (row.status !== PENDING) throw new Error("Row is no longer pending staff attestation.");

    const { data: mem } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organization_id)
      .eq("user_id", row.user_id)
      .eq("active", true)
      .maybeSingle();
    if (mem) {
      throw new Error(
        "This staff member still has active platform access. They must sign the note themselves.",
      );
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("daily_logs")
      .update({
        status: APPROVED,
        approved_at: now,
        approved_by: userId,
        attested_on_behalf: true,
        attested_on_behalf_by: userId,
        attested_on_behalf_reason: data.reason,
        attested_on_behalf_of_staff_id: row.user_id,
      })
      .eq("id", data.id)
      .eq("status", PENDING);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
