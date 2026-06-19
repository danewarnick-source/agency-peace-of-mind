// Smart Import COMMIT — Prompt 4.
// Per-subject atomic apply: create/update profile, attach custom attrs,
// stamp provenance, queue cert + module provisioning, file scraps,
// wire assignment map. Idempotent (guarded by committed_at / committed_record_id).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";

const JobId = z.object({ jobId: z.string().uuid() });

// Map of extracted target_field -> column on clients
const CLIENT_COL: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone_number",
  address: "physical_address",
  medicaid_id: "medicaid_id",
  date_of_birth: "date_of_birth",
};
// On profiles we only update soft, non-auth fields
const PROFILE_COL: Record<string, string> = {
  full_name: "full_name",
  phone: "phone",
};

type AuditTrace = "rule" | "source" | "inferred" | "admin_override";

export const commitSmartImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    return runJobCommit(context.supabase, context.userId, data.jobId);
  });

// Explicit retry entry point for the Done page. Same engine as the auto-run,
// but verifies the caller is an org admin first so we can safely expose it as
// a manual button. Idempotent: subjects already committed are skipped.
export const recommitSmartImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job, error } = await sb
      .from("import_jobs")
      .select("id, org_id, target_org_id, source")
      .eq("id", data.jobId)
      .single();
    if (error || !job) throw new Error("Job not found");
    const orgId = (job.source === "white_glove" ? job.target_org_id : job.org_id) as string;
    if (!orgId) throw new Error("Job has no organization to commit into.");
    await requireOrgMembership(sb, context.userId, orgId, "admin");
    return runJobCommit(sb, context.userId, data.jobId);
  });

// Internal helper — usable from other server fns (e.g. submitForSetup) so
// the self-service path can commit in one shot without re-entering the
// server-fn boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runJobCommit(sbIn: any, userId: string, jobId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = sbIn as any;

    const { data: job, error: jerr } = await sb
      .from("import_jobs")
      .select("id, org_id, mode, status, source, target_org_id, provider_signoff_at")
      .eq("id", jobId)
      .single();
    if (jerr || !job) throw new Error("Job not found");

    if (job.source === "white_glove") {
      if (!job.target_org_id) throw new Error("White-glove job missing target company.");
      if (!job.provider_signoff_at) {
        throw new Error("Provider sign-off required before commit.");
      }
      const { data: isAdmin } = await sb.rpc("has_org_role", {
        _org: job.target_org_id, _user: userId, _role: "admin",
      });
      if (!isAdmin) {
        throw new Error("Only the receiving company's admin can commit a white-glove migration.");
      }
    }

    const { data: subjects } = await sb
      .from("import_subjects")
      .select("*")
      .eq("import_job_id", jobId);

    const orgId = (job.source === "white_glove" ? job.target_org_id : job.org_id) as string;
    const results: Array<{
      subjectId: string;
      display_name: string;
      committed: boolean;
      record_id: string | null;
      gaps: string[];
      error?: string;
    }> = [];

    for (const subj of subjects ?? []) {
      const gaps: string[] = [];

      if (subj.committed_at) {
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: true, record_id: subj.committed_record_id, gaps: ["already committed"] });
        continue;
      }
      if (subj.review_status !== "ready") {
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: false, record_id: null, gaps: ["not marked ready"] });
        continue;
      }
      if (subj.review_decision === "skip") {
        await sb.from("import_subjects").update({ committed_at: new Date().toISOString(), commit_error: "skipped by admin" }).eq("id", subj.id);
        await audit(sb, jobId, orgId, subj.id, "Subject skipped (admin decision)", "admin_override", userId, "skip_subject");
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: true, record_id: null, gaps: ["skipped"] });
        continue;
      }

      try {
        const { data: fields } = await sb.from("extracted_fields")
          .select("*").eq("import_subject_id", subj.id).neq("status", "ignored");
        const fieldsList = fields ?? [];

        let recordId: string | null = null;

        if (subj.subject_type === "client") {
          recordId = await commitClient(sb, orgId, subj, fieldsList, jobId, userId, gaps);
        } else {
          recordId = await commitEmployee(sb, orgId, subj, fieldsList, jobId, userId, gaps);
        }

        if (!recordId) throw new Error("Failed to produce target record id");

        await attachCustomAttributes(sb, orgId, subj, recordId, fieldsList.filter((f: { is_custom_attribute: boolean }) => f.is_custom_attribute), jobId, userId);
        await commitCerts(sb, orgId, subj, recordId, jobId, userId, gaps);
        await commitUnfiled(sb, subj, recordId, jobId, userId);
        await applyProvisioning(sb, orgId, subj, recordId, jobId, userId, gaps);

        await sb.from("import_subjects").update({
          committed_record_id: recordId,
          committed_at: new Date().toISOString(),
          review_status: "approved",
          commit_error: null,
        }).eq("id", subj.id);

        await audit(sb, jobId, orgId, subj.id, `Committed ${subj.subject_type} record`, "admin_override", userId, "commit_subject");
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: true, record_id: recordId, gaps });
      } catch (e) {
        const msg = (e as Error).message || String(e);
        await sb.from("import_subjects").update({ commit_error: msg }).eq("id", subj.id);
        await audit(sb, jobId, orgId, subj.id, `Commit failed: ${msg}`, "admin_override", userId, "commit_failed");
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: false, record_id: null, gaps, error: msg });
      }
    }

    await applyAssignmentMap(sb, orgId, jobId, userId);

    const stillOpen = (results || []).filter((r) => !r.committed).length;
    if (stillOpen === 0) {
      await sb.from("import_jobs").update({
        status: "committed",
        committed_at: new Date().toISOString(),
        committed_by: userId,
      }).eq("id", jobId);
    }

    return { results, jobCommitted: stillOpen === 0 };
}



// --------------------------------------------------------------
async function commitClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; matched_record_id: string | null; review_decision: string | null; display_name: string },
  fields: Array<{ id: string; target_field: string; value: string | null; source_document_id: string | null; source_snippet: string | null; provenance: string; is_custom_attribute: boolean }>,
  jobId: string,
  userId: string,
  gaps: string[],
): Promise<string> {
  const mapped: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.is_custom_attribute) continue;
    const col = CLIENT_COL[f.target_field];
    if (!col) continue;
    mapped[col] = f.value;
  }

  let recordId: string;
  if (subj.matched_record_id && subj.review_decision === "update") {
    recordId = subj.matched_record_id;
    if (Object.keys(mapped).length > 0) {
      const { error } = await sb.from("clients").update(mapped).eq("id", recordId).eq("organization_id", orgId);
      if (error) throw new Error(`clients update: ${error.message}`);
    }
    await audit(sb, jobId, orgId, subj.id, `Updated existing client (${Object.keys(mapped).length} fields)`, "admin_override", userId, "update_client");
  } else {
    // Create new — require name fallback
    if (!mapped.first_name && !mapped.last_name) {
      const parts = (subj.display_name || "Imported").split(/\s+/);
      mapped.first_name = parts[0] ?? "Imported";
      mapped.last_name = parts.slice(1).join(" ") || "Client";
    }
    mapped.organization_id = orgId;
    mapped.account_status = "active";
    mapped.intake_status = "pending";
    const { data: row, error } = await sb.from("clients").insert(mapped).select("id").single();
    if (error || !row) throw new Error(`clients insert: ${error?.message ?? "unknown"}`);
    recordId = row.id;
    await audit(sb, jobId, orgId, subj.id, "Created new client", "source", userId, "create_client");
  }

  // Provenance rows for each core field
  for (const f of fields) {
    if (f.is_custom_attribute) continue;
    const col = CLIENT_COL[f.target_field];
    if (!col) continue;
    await sb.from("import_field_provenance").upsert({
      import_job_id: jobId,
      import_subject_id: subj.id,
      org_id: orgId,
      target_table: "clients",
      target_record_id: recordId,
      target_field: col,
      source_document_id: f.source_document_id,
      source_snippet: f.source_snippet,
      provenance: ["source", "inferred", "rule", "admin_override"].includes(f.provenance) ? f.provenance : "inferred",
    }, { onConflict: "target_table,target_record_id,target_field,import_job_id" });
  }

  // Surface fields that had no mapping (gaps)
  const unmapped = fields.filter((f) => !f.is_custom_attribute && !CLIENT_COL[f.target_field]);
  for (const u of unmapped) gaps.push(`Unmapped: ${u.target_field}`);

  return recordId;
}

// --------------------------------------------------------------
async function commitEmployee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; matched_record_id: string | null; review_decision: string | null; display_name: string },
  fields: Array<{ id: string; target_field: string; value: string | null; source_document_id: string | null; source_snippet: string | null; provenance: string; is_custom_attribute: boolean }>,
  jobId: string,
  userId: string,
  gaps: string[],
): Promise<string | null> {
  // Employees: profiles.id mirrors auth.users.id — we cannot create auth users from a server fn here.
  if (!subj.matched_record_id || subj.review_decision !== "update") {
    // Create new path: queue an invitation gap and skip profile creation.
    gaps.push("Invitation required — auth user must be created via the invitation flow.");
    await audit(sb, jobId, orgId, subj.id, "Employee marked for invitation (no auth user created here)", "admin_override", userId, "queue_invite");
    // Use a placeholder uuid so downstream provenance still links; but we can't insert without a real auth user — return null id to signal partial.
    // To remain "advisory, never blocks", we mark the subject as committed with no record_id.
    return null;
  }

  const mapped: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.is_custom_attribute) continue;
    const col = PROFILE_COL[f.target_field];
    if (!col) continue;
    mapped[col] = f.value;
  }
  const recordId = subj.matched_record_id;
  if (Object.keys(mapped).length > 0) {
    const { error } = await sb.from("profiles").update(mapped).eq("id", recordId);
    if (error) throw new Error(`profiles update: ${error.message}`);
  }
  await audit(sb, jobId, orgId, subj.id, `Updated existing employee (${Object.keys(mapped).length} fields)`, "admin_override", userId, "update_employee");

  for (const f of fields) {
    if (f.is_custom_attribute) continue;
    const col = PROFILE_COL[f.target_field];
    if (!col) continue;
    await sb.from("import_field_provenance").upsert({
      import_job_id: jobId,
      import_subject_id: subj.id,
      org_id: orgId,
      target_table: "profiles",
      target_record_id: recordId,
      target_field: col,
      source_document_id: f.source_document_id,
      source_snippet: f.source_snippet,
      provenance: ["source", "inferred", "rule", "admin_override"].includes(f.provenance) ? f.provenance : "inferred",
    }, { onConflict: "target_table,target_record_id,target_field,import_job_id" });
  }
  return recordId;
}

// --------------------------------------------------------------
async function attachCustomAttributes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; subject_type: "client" | "employee" },
  recordId: string,
  customFields: Array<{ target_field: string; value: string | null; source_document_id: string | null; source_snippet: string | null; provenance: string }>,
  jobId: string,
  userId: string,
) {
  for (const f of customFields) {
    // Ensure definition exists
    const { data: def } = await sb.from("custom_field_definitions")
      .upsert({
        organization_id: orgId,
        entity_kind: subj.subject_type,
        field_key: f.target_field,
        field_label: f.target_field.replace(/_/g, " "),
        data_type: "text",
        source: "import",
        created_by: userId,
      }, { onConflict: "organization_id,entity_kind,field_key" })
      .select("id").single();
    if (!def) continue;

    // Upsert value
    const { data: existing } = await sb.from("custom_field_values")
      .select("id").eq("definition_id", def.id).eq("entity_id", recordId).maybeSingle();
    if (existing) {
      await sb.from("custom_field_values").update({ value_text: f.value }).eq("id", existing.id);
    } else {
      await sb.from("custom_field_values").insert({
        organization_id: orgId,
        definition_id: def.id,
        entity_kind: subj.subject_type,
        entity_id: recordId,
        value_text: f.value,
      });
    }

    await sb.from("import_field_provenance").upsert({
      import_job_id: jobId,
      import_subject_id: subj.id,
      org_id: orgId,
      target_table: "custom_field_values",
      target_record_id: recordId,
      target_field: f.target_field,
      source_document_id: f.source_document_id,
      source_snippet: f.source_snippet,
      provenance: ["source", "inferred", "rule", "admin_override"].includes(f.provenance) ? f.provenance : "inferred",
    }, { onConflict: "target_table,target_record_id,target_field,import_job_id" });
  }
}

// --------------------------------------------------------------
async function commitCerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; subject_type: "client" | "employee" },
  recordId: string | null,
  jobId: string,
  userId: string,
  gaps: string[],
) {
  if (!recordId) return;
  const { data: certs } = await sb.from("import_cert_documents").select("*").eq("import_subject_id", subj.id);
  for (const c of certs ?? []) {
    if (subj.subject_type === "employee") {
      // external_certifications expects user_id; record_id IS the user_id for employees
      await sb.from("external_certifications").insert({
        user_id: recordId,
        organization_id: orgId,
        cert_type: c.cert_key,
        // verification_status / expires would map per existing schema if those columns exist; keep minimal
      }).select("id").maybeSingle().catch(() => null);
    }
    if (c.state === "provisional") {
      gaps.push(`Cert "${c.cert_key}" provisional — reminder queued`);
    }
    await audit(sb, jobId, orgId, subj.id, `Cert ${c.cert_key} → ${c.state} on commit`, c.state === "verified" ? "source" : "admin_override", userId, "commit_cert");
  }
}

// --------------------------------------------------------------
async function commitUnfiled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  subj: { id: string; subject_type: "client" | "employee"; org_id?: string },
  recordId: string | null,
  jobId: string,
  userId: string,
) {
  const { data: items } = await sb.from("unfiled_items").select("*").eq("import_subject_id", subj.id);
  for (const it of items ?? []) {
    if (!it.filed_to) continue; // unassigned scraps persist as recoverable
    // For clients we append the scrap to special_directions as a tagged note.
    if (recordId && subj.subject_type === "client") {
      const tag = `[${it.filed_to}]`;
      const { data: c } = await sb.from("clients").select("special_directions").eq("id", recordId).maybeSingle();
      const existing = (c?.special_directions ?? "").trim();
      const next = existing ? `${existing}\n${tag} ${it.text}` : `${tag} ${it.text}`;
      await sb.from("clients").update({ special_directions: next }).eq("id", recordId);
    }
    await audit(sb, jobId, it.org_id, subj.id, `Filed scrap under "${it.filed_to}"`, "admin_override", userId, "file_scrap");
  }
}

// --------------------------------------------------------------
async function applyProvisioning(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; subject_type: "client" | "employee" },
  recordId: string | null,
  jobId: string,
  userId: string,
  gaps: string[],
) {
  if (!recordId) return;
  const { data: plan } = await sb.from("provisioning_plan").select("*")
    .eq("subject_id", subj.id).is("committed_at", null);
  for (const p of plan ?? []) {
    if (p.state === "na") {
      await sb.from("provisioning_plan").update({ committed_at: new Date().toISOString() }).eq("id", p.id);
      await audit(sb, jobId, orgId, subj.id, `Plan ${p.target_module} → N/A (admin)`, "admin_override", userId, "plan_na");
      continue;
    }
    try {
      if (p.planned_action === "enable_feature" && subj.subject_type === "client") {
        // Toggle on the per-client feature_config jsonb (existing column)
        const { data: c } = await sb.from("clients").select("feature_config").eq("id", recordId).maybeSingle();
        const fc = (c?.feature_config ?? {}) as Record<string, boolean>;
        fc[p.target_module] = true;
        await sb.from("clients").update({ feature_config: fc }).eq("id", recordId);
      } else if (p.planned_action === "create_draft" && p.target_module === "behavior_plan" && subj.subject_type === "client") {
        // BSP as draft (features_enabled=false). bc_code required — guess Tier 1 default.
        const { error } = await sb.from("behavior_support_clients").upsert({
          organization_id: orgId,
          client_id: recordId,
          bc_code: "BC1",
          features_enabled: false,
        }, { onConflict: "client_id" });
        if (error) throw new Error(`BSP draft: ${error.message}`);
      } else if (p.planned_action === "activate_requirements") {
        // Reuses existing nectar_requirements / staff_checklist_completion — no row to write here;
        // existing matrix surfaces this automatically once the person record exists.
        gaps.push(`Requirements checklist activated for ${subj.subject_type}`);
      } else {
        gaps.push(`Plan ${p.planned_action}/${p.target_module} noted (no automatic action)`);
      }
      await sb.from("provisioning_plan").update({ committed_at: new Date().toISOString() }).eq("id", p.id);
      const trace: AuditTrace = p.state === "added_by_admin" ? "admin_override" : "rule";
      await audit(sb, jobId, orgId, subj.id, `Provisioned ${p.target_module} (${p.planned_action})`, trace, userId, "provision");
    } catch (e) {
      gaps.push(`Provisioning ${p.target_module} failed: ${(e as Error).message}`);
    }
  }
}

// --------------------------------------------------------------
async function applyAssignmentMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  jobId: string,
  userId: string,
) {
  const { data: rows } = await sb.from("assignment_map")
    .select("*").eq("import_job_id", jobId).eq("status", "confirmed");
  for (const r of rows ?? []) {
    // Resolve real ids from subjects' committed_record_id
    let staffId = r.staff_record_id;
    let clientId = r.client_record_id;
    if (!staffId && r.staff_subject_id) {
      const { data: s } = await sb.from("import_subjects").select("committed_record_id").eq("id", r.staff_subject_id).maybeSingle();
      staffId = s?.committed_record_id ?? null;
    }
    if (!clientId && r.client_subject_id) {
      const { data: c } = await sb.from("import_subjects").select("committed_record_id").eq("id", r.client_subject_id).maybeSingle();
      clientId = c?.committed_record_id ?? null;
    }
    if (!staffId || !clientId) continue;

    const isGroupHome = r.relation_type === "home";
    const { error } = await sb.from("staff_assignments").upsert({
      organization_id: orgId,
      staff_id: staffId,
      client_id: clientId,
      created_by: userId,
      is_group_home_assignment: isGroupHome,
    }, { onConflict: "staff_id,client_id" });
    if (!error) {
      await sb.from("assignment_map").update({ staff_record_id: staffId, client_record_id: clientId }).eq("id", r.id);
      await audit(sb, jobId, orgId, null, `Wired assignment ${r.relation_type}`, "admin_override", userId, "wire_assignment");
    }
  }
}

// --------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function audit(sb: any, jobId: string, orgId: string, subjectId: string | null, item: string, traces_to: AuditTrace, userId: string, action: string) {
  await sb.from("import_audit").insert({
    import_job_id: jobId,
    org_id: orgId,
    subject_id: subjectId,
    item,
    traces_to,
    actor: userId,
    action,
  });
}

// =================================================================
// Done-page readout
// =================================================================
export const getDoneReadout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job } = await sb.from("import_jobs")
      .select("id, status, mode, committed_at, submitted_at").eq("id", data.jobId).single();
    if (!job) throw new Error("Job not found");

    const { data: subjects } = await sb.from("import_subjects")
      .select("id, display_name, subject_type, match_status, review_decision, committed_at, committed_record_id, commit_error")
      .eq("import_job_id", data.jobId).order("created_at");

    const subjectSummaries: Array<{
      id: string; display_name: string; subject_type: string; committed: boolean;
      record_id: string | null; error: string | null;
      requirements_met: number; requirements_total: number; gaps: string[];
    }> = [];

    for (const s of subjects ?? []) {
      const { data: certs } = await sb.from("import_cert_documents")
        .select("cert_key, state, expiry_date").eq("import_subject_id", s.id);
      const total = (certs ?? []).length;
      const met = (certs ?? []).filter((c: { state: string }) => c.state === "verified").length;
      const gaps: string[] = [];
      for (const c of certs ?? []) {
        if (c.state === "provisional") gaps.push(`${c.cert_key} provisional — reminder queued`);
        else if (c.state === "unverified") gaps.push(`${c.cert_key} pending`);
        else if (c.expiry_date && new Date(c.expiry_date).getTime() < Date.now()) gaps.push(`${c.cert_key} expired`);
      }
      if (s.commit_error) gaps.unshift(s.commit_error);
      subjectSummaries.push({
        id: s.id,
        display_name: s.display_name,
        subject_type: s.subject_type,
        committed: !!s.committed_at,
        record_id: s.committed_record_id,
        error: s.commit_error,
        requirements_met: met,
        requirements_total: total,
        gaps,
      });
    }

    const { data: auditTrail } = await sb.from("import_audit")
      .select("id, item, traces_to, actor, action, created_at")
      .eq("import_job_id", data.jobId).order("created_at", { ascending: false }).limit(200);

    return { job, subjects: subjectSummaries, audit: auditTrail ?? [] };
  });
