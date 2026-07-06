/**
 * Supervisor-side queue for EVV timesheets held by the compliance gate.
 *
 * A row is "held" when ALL of these are true:
 *   - evv_timesheets.clock_out_timestamp IS NOT NULL   (staff finished the punch)
 *   - evv_timesheets.billed_units        IS NULL       (billable finalize NOT run)
 *   - one or more OPEN (resolution IS NULL) nectar_compliance_flags rows
 *     with detection_type='billing_conflict' and
 *     subject_context.source='evv_close' and
 *     subject_context.timesheet_id = <this timesheet id>
 *
 * `resolveHeldTimesheet` is a single admin/manager action that closes the
 * open flag(s) AND — on acknowledge — runs the billable finalize
 * (`billed_units` + `status='Pending'`) in the same call. On stop, the
 * timesheet stays held (punch preserved, not billed) and flags close as
 * `stopped`. Preserved punch timestamps are never mutated here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeEntryUnits } from "./billing-units";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureOverrideRole(supabase: any, userId: string, orgId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = data?.role;
  if (role !== "admin" && role !== "manager" && role !== "super_admin") {
    throw new Error("Forbidden — admin, manager, or super_admin required to resolve held timesheets");
  }
  return role as "admin" | "manager" | "super_admin";
}

export type HeldTimesheetFlag = {
  id: string;
  rule_id: string;
  requirement_id: string;
  matched_codes: string[];
  source: { title: string; verbatim: string; citation: string | null };
  raised_at: string;
  raised_to: string | null;
};

export type HeldTimesheetRow = {
  timesheet_id: string;
  organization_id: string;
  client_id: string | null;
  client_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  service_date: string;
  service_type_code: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string;
  held_at: string;
  flags: HeldTimesheetFlag[];
};

export const listHeldTimesheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<HeldTimesheetRow[]> => {
    const { supabase } = context;
    const { data: flags, error: fe } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .select("id, rule_id, requirement_id, subject_context, source_snapshot, raised_at, raised_to")
      .eq("organization_id", data.organizationId)
      .eq("detection_type", "billing_conflict")
      .is("resolution", null)
      .order("raised_at", { ascending: false });
    if (fe) throw new Error(fe.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evvFlags = ((flags ?? []) as any[]).filter((f) => {
      const s = (f.subject_context ?? {}) as Record<string, unknown>;
      return s.source === "evv_close" && typeof s.timesheet_id === "string";
    });
    if (evvFlags.length === 0) return [];

    const timesheetIds = Array.from(
      new Set(evvFlags.map((f) => String((f.subject_context as Record<string, unknown>).timesheet_id))),
    );

    const { data: timesheets, error: te } = await supabase
      .from("evv_timesheets")
      .select("id, client_id, staff_id, service_type_code, clock_in_timestamp, clock_out_timestamp, billed_units, organization_id")
      .in("id", timesheetIds)
      .eq("organization_id", data.organizationId)
      .not("clock_out_timestamp", "is", null)
      .is("billed_units", null);
    if (te) throw new Error(te.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heldById = new Map<string, any>(((timesheets ?? []) as any[]).map((t) => [String(t.id), t]));
    if (heldById.size === 0) return [];

    const clientIds = Array.from(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set(((timesheets ?? []) as any[]).map((t) => t.client_id).filter(Boolean)),
    ) as string[];
    const staffIds = Array.from(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set(((timesheets ?? []) as any[]).map((t) => t.staff_id).filter(Boolean)),
    ) as string[];

    const [clientsQ, profilesQ] = await Promise.all([
      clientIds.length
        ? supabase.from("clients").select("id, first_name, last_name").in("id", clientIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      staffIds.length
        ? supabase.from("profiles").select("id, first_name, last_name, email").in("id", staffIds)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameOf = (r: any): string | null => {
      const n = [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
      return n || r?.email || null;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientMap = new Map(((clientsQ.data ?? []) as any[]).map((c) => [String(c.id), nameOf(c)]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffMap = new Map(((profilesQ.data ?? []) as any[]).map((p) => [String(p.id), nameOf(p)]));

    const grouped = new Map<string, HeldTimesheetRow>();
    for (const f of evvFlags) {
      const ctx = f.subject_context as Record<string, unknown>;
      const tid = String(ctx.timesheet_id);
      const ts = heldById.get(tid);
      if (!ts) continue;
      let row = grouped.get(tid);
      if (!row) {
        row = {
          timesheet_id: tid,
          organization_id: data.organizationId,
          client_id: ts.client_id ?? null,
          client_name: ts.client_id ? clientMap.get(String(ts.client_id)) ?? null : null,
          staff_id: ts.staff_id ?? null,
          staff_name: ts.staff_id ? staffMap.get(String(ts.staff_id)) ?? null : null,
          service_date: String(ts.clock_in_timestamp).slice(0, 10),
          service_type_code: ts.service_type_code ?? null,
          clock_in_timestamp: ts.clock_in_timestamp,
          clock_out_timestamp: ts.clock_out_timestamp,
          held_at: f.raised_at,
          flags: [],
        };
        grouped.set(tid, row);
      }
      const snap = (f.source_snapshot ?? {}) as Record<string, unknown>;
      row.flags.push({
        id: f.id,
        rule_id: f.rule_id,
        requirement_id: f.requirement_id,
        matched_codes: Array.isArray(ctx.matchedCodes) ? (ctx.matchedCodes as string[]) : [],
        source: {
          title: (snap.title as string) ?? "Requirement",
          verbatim: (snap.verbatim as string) ?? "",
          citation: (snap.citation as string | null) ?? null,
        },
        raised_at: f.raised_at,
        raised_to: f.raised_to ?? null,
      });
      if (new Date(f.raised_at).getTime() < new Date(row.held_at).getTime()) {
        row.held_at = f.raised_at;
      }
    }
    return Array.from(grouped.values());
  });

export const resolveHeldTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        timesheetId: z.string().uuid(),
        decision: z.enum(["acknowledge_and_finalize", "stop"]),
        note: z.string().trim().min(1, "Resolution note required").max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureOverrideRole(supabase, userId, data.organizationId);

    // Verify still held.
    const { data: ts, error: te } = await supabase
      .from("evv_timesheets")
      .select("id, organization_id, clock_in_timestamp, clock_out_timestamp, billed_units")
      .eq("id", data.timesheetId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (te) throw new Error(te.message);
    if (!ts) throw new Error("Timesheet not found");
    if (!ts.clock_out_timestamp) throw new Error("Timesheet has no clock-out to finalize");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((ts as any).billed_units != null) throw new Error("Timesheet already finalized");

    // Load open evv_close flags for THIS timesheet.
    const { data: openFlags, error: fe } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .select("id, subject_context")
      .eq("organization_id", data.organizationId)
      .eq("detection_type", "billing_conflict")
      .is("resolution", null);
    if (fe) throw new Error(fe.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mine = ((openFlags ?? []) as any[]).filter((f) => {
      const s = (f.subject_context ?? {}) as Record<string, unknown>;
      return s.source === "evv_close" && s.timesheet_id === data.timesheetId;
    });
    if (mine.length === 0) {
      throw new Error("No open compliance flag found for this timesheet — it may have been resolved already.");
    }

    const resolution = data.decision === "acknowledge_and_finalize" ? "acknowledged_continued" : "stopped";
    const nowIso = new Date().toISOString();

    // Resolve every open flag tied to this timesheet. The BEFORE UPDATE
    // freeze trigger locks each row after this write.
    const { error: re } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_compliance_flags" as any)
      .update({
        resolution,
        resolved_by: userId,
        resolved_at: nowIso,
        resolution_note: data.note,
      })
      .in(
        "id",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mine as any[]).map((f) => f.id),
      )
      .is("resolution", null);
    if (re) throw new Error(re.message);

    if (data.decision === "stop") {
      return {
        ok: true as const,
        finalized: false as const,
        flagsResolved: mine.length,
      };
    }

    // Acknowledge → billable finalize. Preserved punch timestamps are
    // NOT touched — we only add billed_units + status.
    const units = computeEntryUnits(ts.clock_in_timestamp, ts.clock_out_timestamp);
    const { error: ue } = await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ billed_units: units, status: "Pending" } as any)
      .eq("id", data.timesheetId);
    if (ue) throw new Error(ue.message);

    return {
      ok: true as const,
      finalized: true as const,
      flagsResolved: mine.length,
      billedUnits: units,
    };
  });
