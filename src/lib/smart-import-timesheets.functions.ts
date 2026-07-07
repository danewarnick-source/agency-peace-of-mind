// Historical-timesheet spreadsheet import — commits reviewed rows into
// evv_timesheets with a permanent `import_source='historical_import'` marker
// and a link back to the parent import_jobs row so nothing is ever confused
// with a live clock punch. This function is authenticated and org-scoped;
// it never creates staff or client records.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.object({
  staff_id: z.string().uuid(),
  client_id: z.string().uuid(),
  clock_in_iso: z.string().min(10),
  clock_out_iso: z.string().min(10),
  service_code: z.string().min(1).max(20),
  notes: z.string().max(4000).nullable().optional(),
  source_row: z.record(z.string(), z.string()).optional(),
});

export const createTimesheetImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; source_summary?: string }) =>
    z.object({
      organization_id: z.string().uuid(),
      source_summary: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;
    const { data: job, error } = await supabase
      .from("import_jobs")
      .insert({
        org_id: data.organization_id,
        mode: "timesheets",
        status: "in_review",
        source: "self_service",
        source_summary: data.source_summary ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { jobId: job.id as string };
  });

export const importHistoricalTimesheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    job_id: string;
    file_name: string;
    rows: Array<z.infer<typeof RowSchema>>;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      job_id: z.string().uuid(),
      file_name: z.string().min(1).max(300),
      rows: z.array(RowSchema).min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase, userId } = context as any;

    // Verify staff + clients belong to this org
    const staffIds = Array.from(new Set(data.rows.map((r) => r.staff_id)));
    const clientIds = Array.from(new Set(data.rows.map((r) => r.client_id)));
    const [staffRes, clientRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organization_id)
        .in("user_id", staffIds),
      supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organization_id)
        .in("id", clientIds),
    ]);
    if (staffRes.error) throw new Error(staffRes.error.message);
    if (clientRes.error) throw new Error(clientRes.error.message);
    const validStaff = new Set((staffRes.data ?? []).map((r: { user_id: string }) => r.user_id));
    const validClients = new Set((clientRes.data ?? []).map((r: { id: string }) => r.id));

    const importedAt = new Date().toISOString();
    const rejected: Array<{ index: number; reason: string }> = [];
    const inserts: Array<Record<string, unknown>> = [];

    data.rows.forEach((r, idx) => {
      if (!validStaff.has(r.staff_id)) {
        rejected.push({ index: idx, reason: "staff not in organization" });
        return;
      }
      if (!validClients.has(r.client_id)) {
        rejected.push({ index: idx, reason: "client not in organization" });
        return;
      }
      const inTs = new Date(r.clock_in_iso);
      const outTs = new Date(r.clock_out_iso);
      if (isNaN(inTs.getTime()) || isNaN(outTs.getTime())) {
        rejected.push({ index: idx, reason: "invalid date/time" });
        return;
      }
      if (outTs.getTime() <= inTs.getTime()) {
        rejected.push({ index: idx, reason: "clock-out must be after clock-in" });
        return;
      }
      inserts.push({
        organization_id: data.organization_id,
        staff_id: r.staff_id,
        client_id: r.client_id,
        utah_medicaid_provider_id: "",
        utah_medicaid_member_id: "",
        service_type_code: r.service_code.toUpperCase(),
        clock_in_timestamp: inTs.toISOString(),
        clock_out_timestamp: outTs.toISOString(),
        raw_clock_in: inTs.toISOString(),
        raw_clock_out: outTs.toISOString(),
        gps_in_coordinates: {},
        gps_out_coordinates: {},
        gps_validated: false,
        is_out_of_bounds: false,
        shift_entry_type: "Historical_Import",
        // Stage 3 releases entries into the staff member's confirmation queue.
        // Nothing from the historical import path lands as 'Approved' directly —
        // staff have to attest before the entry is finalized (stage 4).
        status: "Pending_Staff_Confirmation",
        staff_flagged: false,
        shift_note_text: r.notes || null,
        import_source: "historical_import",
        import_job_id: data.job_id,
        edit_audit_history_log: [
          {
            kind: "historical_import",
            job_id: data.job_id,
            file_name: data.file_name,
            imported_by: userId,
            imported_at: importedAt,
            source_row: r.source_row ?? null,
          },
        ],
      });
    });

    if (inserts.length === 0) {
      return { inserted: 0, rejected };
    }

    // Bulk insert in chunks so we stay well under any single-statement limits.
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("evv_timesheets")
        .insert(chunk, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }

    // Job stays open (status='submitted_to_staff') until every released
    // entry is confirmed or flagged. It is NOT 'committed' here — that used
    // to imply the timesheets were live/approved, which no longer matches
    // reality under the four-stage flow.
    await supabase
      .from("import_jobs")
      .update({
        status: "submitted_to_staff",
        submitted_at: new Date().toISOString(),
        submitted_by: userId,
      })
      .eq("id", data.job_id);

    // Count distinct staff so the wizard's Done screen can show
    // "submitted to N staff members" without a second round-trip.
    const staffCount = new Set(inserts.map((i) => i.staff_id as string)).size;

    return { inserted, rejected, staffCount };
  });
