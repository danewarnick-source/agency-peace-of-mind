// Smart Import History — list past jobs, resume/discard uncommitted,
// and provenance-aware undo for committed jobs. Admin-only via RLS.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OrgInput = z.object({ organizationId: z.string().uuid() });
const JobInput = z.object({ jobId: z.string().uuid() });

// ----- LIST -----
export const listImportJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: jobs, error } = await sb
      .from("import_jobs")
      .select("id, status, mode, source, created_at, committed_at, submitted_at, created_by, notes")
      .eq("org_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = (jobs ?? []).map((j: { id: string }) => j.id);
    if (ids.length === 0) return [];

    const [{ data: subj }, { data: docs }, { data: creators }] = await Promise.all([
      sb.from("import_subjects").select("import_job_id, id, committed_record_id, subject_type").in("import_job_id", ids),
      sb.from("import_documents").select("import_job_id, id").in("import_job_id", ids),
      sb.from("profiles").select("id, full_name, email").in("id", Array.from(new Set((jobs ?? []).map((j: { created_by: string }) => j.created_by).filter(Boolean)))),
    ]);

    const subjByJob = new Map<string, { total: number; committed: number; sample: Array<{ id: string; record_id: string | null; type: string }> }>();
    for (const s of subj ?? []) {
      const e = subjByJob.get(s.import_job_id) ?? { total: 0, committed: 0, sample: [] };
      e.total += 1;
      if (s.committed_record_id) e.committed += 1;
      if (e.sample.length < 3) e.sample.push({ id: s.id, record_id: s.committed_record_id, type: s.subject_type });
      subjByJob.set(s.import_job_id, e);
    }
    const docByJob = new Map<string, number>();
    for (const d of docs ?? []) docByJob.set(d.import_job_id, (docByJob.get(d.import_job_id) ?? 0) + 1);
    const creatorMap = new Map<string, { name: string; email: string | null }>();
    for (const c of creators ?? []) creatorMap.set(c.id, { name: c.full_name ?? c.email ?? "Unknown", email: c.email });

    return (jobs ?? []).map((j: { id: string; status: string; mode: string | null; source: string | null; created_at: string; committed_at: string | null; submitted_at: string | null; created_by: string; notes: string | null }) => ({
      ...j,
      documents: docByJob.get(j.id) ?? 0,
      subjects_total: subjByJob.get(j.id)?.total ?? 0,
      subjects_committed: subjByJob.get(j.id)?.committed ?? 0,
      sample_subjects: subjByJob.get(j.id)?.sample ?? [],
      created_by_name: creatorMap.get(j.created_by)?.name ?? "Unknown",
    }));
  });

// ----- DISCARD (uncommitted only) -----
export const discardImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job, error } = await sb.from("import_jobs")
      .select("id, org_id, status").eq("id", data.jobId).single();
    if (error || !job) throw new Error("Job not found");
    if (job.status === "committed") throw new Error("Committed jobs cannot be discarded.");
    if (job.status === "discarded") return { ok: true, alreadyDiscarded: true };

    // Collect storage paths first
    const { data: docs } = await sb.from("import_documents")
      .select("storage_path").eq("import_job_id", data.jobId);
    const paths = (docs ?? []).map((d: { storage_path: string }) => d.storage_path).filter(Boolean);
    if (paths.length) {
      await sb.storage.from("import-documents").remove(paths).catch(() => null);
    }

    // Wipe staging — explicit deletes (in addition to the FK cascade) so
    // any non-cascading writes are scrubbed.
    const jobIdEq = ["extracted_fields", "unfiled_items", "assignment_map",
      "provisioning_plan", "import_subjects", "import_cert_documents",
      "import_nectar_questions", "import_field_provenance", "import_documents"];
    for (const t of jobIdEq) {
      await sb.from(t).delete().eq("import_job_id", data.jobId);
    }

    await sb.from("import_audit").insert({
      import_job_id: data.jobId, org_id: job.org_id,
      item: `Job discarded (${paths.length} file${paths.length === 1 ? "" : "s"} purged)`,
      traces_to: "admin_override", actor: context.userId, action: "discard_job",
    });
    await sb.from("import_jobs").update({ status: "discarded" }).eq("id", data.jobId);
    return { ok: true, files_removed: paths.length };
  });

// =====================================================================
// UNDO COMMITTED IMPORT — provenance-aware
// =====================================================================
type UndoItem =
  | { kind: "client_record"; record_id: string; display_name: string; reason: string }
  | { kind: "feature_flag"; client_id: string; module: string; display_name: string }
  | { kind: "bsp_draft"; client_id: string; display_name: string }
  | { kind: "custom_field"; entity_id: string; entity_kind: string; field_key: string; display_name: string }
  | { kind: "filed_scrap"; client_id: string; tag: string; text: string; display_name: string }
  | { kind: "assignment"; staff_id: string; client_id: string }
  | { kind: "profile_field"; profile_id: string; field: string; display_name: string }
  | { kind: "skipped_manual_edit"; record_id: string; display_name: string; reason: string };

// Tolerance: edits within 60s of commit are still considered part of the import.
const GRACE_MS = 60 * 1000;

async function buildUndoPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, jobId: string,
): Promise<{ removes: UndoItem[]; skips: UndoItem[]; job: { id: string; org_id: string; status: string } }> {
  const { data: job, error } = await sb.from("import_jobs")
    .select("id, org_id, status").eq("id", jobId).single();
  if (error || !job) throw new Error("Job not found");
  if (job.status !== "committed") throw new Error("Only committed jobs can be undone.");

  const removes: UndoItem[] = [];
  const skips: UndoItem[] = [];

  const { data: subjects } = await sb.from("import_subjects")
    .select("id, display_name, subject_type, review_decision, committed_record_id, committed_at")
    .eq("import_job_id", jobId);

  for (const s of subjects ?? []) {
    if (!s.committed_record_id || !s.committed_at) continue;
    const committedMs = new Date(s.committed_at).getTime();

    // ---- New clients we created -> safe to remove if untouched after commit
    if (s.subject_type === "client" && s.review_decision !== "update") {
      const { data: c } = await sb.from("clients")
        .select("id, updated_at, first_name, last_name").eq("id", s.committed_record_id).maybeSingle();
      if (!c) continue;
      const edited = new Date(c.updated_at).getTime() > committedMs + GRACE_MS;
      if (edited) {
        skips.push({ kind: "skipped_manual_edit", record_id: c.id, display_name: s.display_name,
          reason: "Profile edited after import — kept." });
        // Still try to undo BSP draft and feature flags individually (each checks own state).
      } else {
        removes.push({ kind: "client_record", record_id: c.id, display_name: s.display_name, reason: "Created by this import" });
        continue; // FK cascade will sweep custom_field_values, bsp, provenance
      }
    }

    // ---- Existing client updated — never delete the client record, but revert
    // feature toggles + BSP drafts + custom attrs + filed scraps if untouched.
    if (s.subject_type === "client") {
      const { data: bsp } = await sb.from("behavior_support_clients")
        .select("client_id, features_enabled, updated_at").eq("client_id", s.committed_record_id).maybeSingle();
      if (bsp && bsp.features_enabled === false &&
          new Date(bsp.updated_at).getTime() <= committedMs + GRACE_MS) {
        removes.push({ kind: "bsp_draft", client_id: s.committed_record_id, display_name: s.display_name });
      }

      const { data: plan } = await sb.from("provisioning_plan")
        .select("target_module, planned_action, state").eq("subject_id", s.id).not("committed_at", "is", null);
      for (const p of plan ?? []) {
        if (p.planned_action === "enable_feature") {
          removes.push({ kind: "feature_flag", client_id: s.committed_record_id, module: p.target_module, display_name: s.display_name });
        }
      }

      // Filed scraps -> tagged notes
      const { data: items } = await sb.from("unfiled_items").select("filed_to, text, org_id").eq("import_subject_id", s.id);
      for (const it of items ?? []) {
        if (it.filed_to) removes.push({ kind: "filed_scrap", client_id: s.committed_record_id, tag: `[${it.filed_to}]`, text: it.text, display_name: s.display_name });
      }
    }

    // ---- Custom field values (clients and employees)
    const { data: prov } = await sb.from("import_field_provenance")
      .select("target_table, target_record_id, target_field").eq("import_job_id", jobId).eq("import_subject_id", s.id);
    for (const p of prov ?? []) {
      if (p.target_table === "custom_field_values") {
        removes.push({
          kind: "custom_field",
          entity_id: p.target_record_id,
          entity_kind: s.subject_type,
          field_key: p.target_field,
          display_name: s.display_name,
        });
      } else if (p.target_table === "profiles" && s.subject_type === "employee") {
        // Only revert profile fields if the profile hasn't been edited post-commit
        const { data: pr } = await sb.from("profiles").select("updated_at").eq("id", s.committed_record_id).maybeSingle();
        const edited = pr ? new Date(pr.updated_at).getTime() > committedMs + GRACE_MS : false;
        if (!edited) {
          removes.push({ kind: "profile_field", profile_id: s.committed_record_id, field: p.target_field, display_name: s.display_name });
        } else {
          skips.push({ kind: "skipped_manual_edit", record_id: s.committed_record_id, display_name: s.display_name,
            reason: `Profile field ${p.target_field} edited after import — kept.` });
        }
      }
    }

    // ---- Assignments
    const { data: am } = await sb.from("assignment_map")
      .select("staff_record_id, client_record_id, status").eq("import_job_id", jobId).eq("status", "confirmed");
    for (const r of am ?? []) {
      if (r.staff_record_id && r.client_record_id) {
        removes.push({ kind: "assignment", staff_id: r.staff_record_id, client_id: r.client_record_id });
      }
    }
  }

  return { removes, skips, job };
}

export const previewUndoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await buildUndoPlan(context.supabase as any, data.jobId);
    return plan;
  });

export const undoCommittedImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const plan = await buildUndoPlan(sb, data.jobId);
    const removed: string[] = [];
    const failed: string[] = [];

    for (const item of plan.removes) {
      try {
        if (item.kind === "client_record") {
          // Cascade clears feature_config, custom values, BSP, provenance via FKs.
          const { error } = await sb.from("clients").delete().eq("id", item.record_id);
          if (error) throw new Error(error.message);
          removed.push(`Removed client ${item.display_name}`);
        } else if (item.kind === "feature_flag") {
          const { data: c } = await sb.from("clients").select("feature_config").eq("id", item.client_id).maybeSingle();
          if (c) {
            const fc = (c.feature_config ?? {}) as Record<string, boolean>;
            if (fc[item.module]) {
              delete fc[item.module];
              await sb.from("clients").update({ feature_config: fc }).eq("id", item.client_id);
              removed.push(`Disabled ${item.module} on ${item.display_name}`);
            }
          }
        } else if (item.kind === "bsp_draft") {
          const { error } = await sb.from("behavior_support_clients")
            .delete().eq("client_id", item.client_id).eq("features_enabled", false);
          if (error) throw new Error(error.message);
          removed.push(`Removed draft BSP for ${item.display_name}`);
        } else if (item.kind === "custom_field") {
          const { data: def } = await sb.from("custom_field_definitions")
            .select("id").eq("field_key", item.field_key).eq("entity_kind", item.entity_kind).maybeSingle();
          if (def) {
            await sb.from("custom_field_values").delete()
              .eq("definition_id", def.id).eq("entity_id", item.entity_id);
            removed.push(`Cleared custom field ${item.field_key} on ${item.display_name}`);
          }
        } else if (item.kind === "filed_scrap") {
          const { data: c } = await sb.from("clients").select("special_directions, updated_at").eq("id", item.client_id).maybeSingle();
          if (c?.special_directions) {
            const line = `${item.tag} ${item.text}`;
            if (c.special_directions.includes(line)) {
              const next = c.special_directions.replace(line, "").replace(/\n\n+/g, "\n").trim();
              await sb.from("clients").update({ special_directions: next }).eq("id", item.client_id);
              removed.push(`Removed filed note on ${item.display_name}`);
            }
          }
        } else if (item.kind === "assignment") {
          await sb.from("staff_assignments").delete()
            .eq("staff_id", item.staff_id).eq("client_id", item.client_id);
          removed.push(`Removed assignment ${item.staff_id} → ${item.client_id}`);
        } else if (item.kind === "profile_field") {
          // Set profile field back to NULL (revert). Only soft fields are eligible.
          await sb.from("profiles").update({ [item.field]: null }).eq("id", item.profile_id);
          removed.push(`Cleared profile.${item.field} on ${item.display_name}`);
        }
      } catch (e) {
        failed.push(`${item.kind}: ${(e as Error).message}`);
      }
    }

    await sb.from("import_audit").insert({
      import_job_id: data.jobId, org_id: plan.job.org_id,
      item: `Undo executed — ${removed.length} item${removed.length === 1 ? "" : "s"} removed, ${plan.skips.length} preserved (post-commit edits)`,
      traces_to: "admin_override", actor: context.userId, action: "undo_import",
    });
    // Job status moves to discarded to reflect that its effects are reversed.
    await sb.from("import_jobs").update({ status: "discarded" }).eq("id", data.jobId);

    return { removed, failed, skipped: plan.skips };
  });
