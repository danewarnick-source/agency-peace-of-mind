// Historical daily-notes / shift-notes spreadsheet import — commits reviewed
// rows into daily_logs with a permanent `import_source='historical_import'`
// marker and a link back to the parent import_jobs row so imported notes are
// never confused with a note written live in HIVE. Authenticated and
// org-scoped; NEVER creates staff or client records.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.object({
  staff_id: z.string().uuid(),
  client_id: z.string().uuid(),
  log_date: z.string().min(8),          // YYYY-MM-DD
  narrative: z.string().min(1).max(8000),
  pcsp_goals_addressed: z.array(z.string().max(500)).max(50).default([]),
  source_row: z.record(z.string(), z.string()).optional(),
});

export const createDailyNotesImportJob = createServerFn({ method: "POST" })
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
        mode: "daily_notes",
        status: "in_review",
        source: "self_service",
        source_summary: data.source_summary ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { jobId: job.id as string };
  });

export const importHistoricalDailyNotes = createServerFn({ method: "POST" })
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

    // Verify staff + clients belong to this org.
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

    const nowIso = new Date().toISOString();
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
      const d = new Date(r.log_date);
      if (isNaN(d.getTime())) {
        rejected.push({ index: idx, reason: "invalid date" });
        return;
      }
      const iso = d.toISOString().slice(0, 10);
      inserts.push({
        organization_id: data.organization_id,
        user_id: r.staff_id,
        client_id: r.client_id,
        log_date: iso,
        narrative: r.narrative,
        pcsp_goals_addressed: r.pcsp_goals_addressed ?? [],
        // Stage 3 lands rows in a "submitted to staff" bucket. They are NOT
        // approved evidence until the original staff member individually
        // signs each one in stage 4 (or an admin attests on behalf of a
        // former staff member with no platform access).
        status: "pending_staff_attestation",
        backdated: true,
        submitted_late: false,
        import_source: "historical_import",
        import_job_id: data.job_id,
      });
    });

    if (inserts.length === 0) {
      return { inserted: 0, rejected };
    }

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("daily_logs")
        .insert(chunk, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted += count ?? chunk.length;
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "submitted_to_staff",
        committed_at: new Date().toISOString(),
        committed_by: userId,
      })
      .eq("id", data.job_id);

    return { inserted, rejected };
  });

