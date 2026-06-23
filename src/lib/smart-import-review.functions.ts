// Smart Import REVIEW server functions — Prompt 3.
// Reads / writes ONLY to Prompt-1 staging tables. Never writes to real records.
// Provisioning plan is computed as a forecast (preview).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  validateClientDraft,
  filterBlocking,
  type ClientDraft,
  type ValidationIssue,
} from "@/lib/import-validation";

const JobId = z.object({ jobId: z.string().uuid() });
const SubjectId = z.object({ subjectId: z.string().uuid() });

// ---------- Job overview + subject queue ----------
export const getReviewJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job, error } = await sb
      .from("import_jobs")
      .select("id, org_id, mode, status, source, scale, notes, created_at, submitted_at, target_org_id, provider_signoff_at, provider_signoff_by, engagement_status")
      .eq("id", data.jobId)
      .single();
    if (error || !job) throw new Error("Job not found");

    const { data: subjects } = await sb
      .from("import_subjects")
      .select("id, display_name, subject_type, match_status, matched_record_id, review_decision, review_status, reviewed_at")
      .eq("import_job_id", data.jobId)
      .order("created_at", { ascending: true });

    const { data: assignments } = await sb
      .from("assignment_map")
      .select("id, relation_type, staff_subject_id, client_subject_id, status, inference_reason")
      .eq("import_job_id", data.jobId);

    return { job, subjects: subjects ?? [], assignments: assignments ?? [] };
  });

// ---------- Per-subject detail ----------
export const getReviewSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubjectId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subject, error } = await sb
      .from("import_subjects")
      .select("*")
      .eq("id", data.subjectId)
      .single();
    if (error || !subject) throw new Error("Subject not found");

    const [{ data: fields }, { data: unfiled }, { data: certs }, { data: questions }] = await Promise.all([
      sb.from("extracted_fields").select("*").eq("import_subject_id", data.subjectId).order("is_custom_attribute"),
      sb.from("unfiled_items").select("*").eq("import_subject_id", data.subjectId),
      sb.from("import_cert_documents").select("*").eq("import_subject_id", data.subjectId),
      sb.from("import_nectar_questions").select("*").eq("import_subject_id", data.subjectId),
    ]);

    // Pull matched existing record (read-only) for diff — coerce to string|null for transport
    let matched: Record<string, string | null> | null = null;
    if (subject.matched_record_id) {
      const table = subject.subject_type === "client" ? "clients" : "profiles";
      const { data: row } = await sb.from(table).select("*").eq("id", subject.matched_record_id).maybeSingle();
      if (row) {
        matched = {};
        for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
          matched[k] = v == null ? null : String(v);
        }
      }
    }



    // ── Validation issues + merge flags (prompt 3 triple-check) ──────────
    const draft = buildDraftFromExtractedFields(fields ?? []);
    const validation = validateClientDraft(draft);
    const overrides = ((subject as { validation_overrides?: Record<string, boolean> }).validation_overrides) ?? {};
    const blockingIssues = filterBlocking(validation.issues, overrides);

    let mergeFlags: Array<Record<string, string | number | boolean | null>> = [];
    if (subject.matched_record_id) {
      const { data: flags } = await sb
        .from("import_merge_flags")
        .select("*")
        .eq("client_id", subject.matched_record_id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      mergeFlags = ((flags ?? []) as Array<Record<string, unknown>>).map((row) => {
        const out: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(row)) {
          if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
          else out[k] = String(v);
        }
        return out;
      });
    }

    return {
      subject,
      fields: fields ?? [],
      unfiled: unfiled ?? [],
      certs: certs ?? [],
      questions: questions ?? [],
      matched,
      validation: {
        ok: blockingIssues.length === 0,
        issues: validation.issues,
        overrides,
        blocking: blockingIssues.map((i) => i.key),
      },
      mergeFlags,
    };
  });

// Build a minimal ClientDraft from extracted_fields rows so the same
// validator runs on review + commit. Mirrors buildClientDraftFromFields in
// smart-import-commit.functions.ts; kept inline to avoid cross-file imports.
function buildDraftFromExtractedFields(
  rows: Array<{ target_field: string; value: string | null }>,
): ClientDraft {
  const d: ClientDraft = {};
  const codes: NonNullable<ClientDraft["billing_codes"]> = [];
  for (const r of rows) {
    const v = (r.value ?? "").trim();
    if (!v) continue;
    switch (r.target_field) {
      case "first_name": d.first_name = v; break;
      case "last_name": d.last_name = v; break;
      case "physical_address":
      case "address":
        d.physical_address = v; break;
      case "medicaid_id": d.medicaid_id = v; break;
      case "date_of_birth":
      case "dob":
        d.date_of_birth = v; break;
      case "admission_date": d.admission_date = v; break;
      case "discharge_date": d.discharge_date = v; break;
      case "form_1056_approved_date": d.form_1056_approved_date = v; break;
      case "is_own_guardian":
        try { d.is_own_guardian = !!(JSON.parse(v) as { bool?: boolean }).bool; }
        catch { d.is_own_guardian = v === "true"; }
        break;
      case "guardian_name": d.guardian_name = v; break;
      case "billing_code_row":
        try {
          const j = JSON.parse(v) as Record<string, unknown>;
          if (j.service_code) {
            codes.push({
              service_code: String(j.service_code).toUpperCase(),
              rate: typeof j.rate === "number" ? j.rate : Number(j.rate) || null,
              max_units: typeof j.max_units === "number" ? j.max_units : Number(j.max_units) || null,
              unit_type: j.unit_type ? String(j.unit_type) : null,
              plan_start: j.plan_start ? String(j.plan_start).slice(0, 10) : null,
              plan_end: j.plan_end ? String(j.plan_end).slice(0, 10) : null,
            });
          }
        } catch { /* malformed */ }
        break;
    }
  }
  if (codes.length) d.billing_codes = codes;
  return d;
}

// Keep ValidationIssue importable from the route file via this re-export.
export type { ValidationIssue };

// ---------- Edit a field value / reassign target / mark edited ----------
const EditField = z.object({
  fieldId: z.string().uuid(),
  value: z.string().optional(),
  target_field: z.string().optional(),
  status: z.enum(["placed", "review", "flag", "edited", "ignored"]).optional(),
});
export const editExtractedField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EditField.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row } = await sb.from("extracted_fields").select("*").eq("id", data.fieldId).single();
    if (!row) throw new Error("Field not found");

    const patch: Record<string, unknown> = {
      edited_by: context.userId,
      edited_at: new Date().toISOString(),
    };
    if (data.value !== undefined && data.value !== row.value) {
      patch.value = data.value;
      patch.original_value = row.original_value ?? row.value;
      patch.status = "edited";
    }
    if (data.target_field && data.target_field !== row.target_field) {
      patch.target_field = data.target_field;
      patch.original_target_field = row.original_target_field ?? row.target_field;
      patch.status = "edited";
    }
    if (data.status) patch.status = data.status;

    const { error } = await sb.from("extracted_fields").update(patch).eq("id", data.fieldId);
    if (error) throw new Error(error.message);

    await sb.from("import_audit").insert({
      import_job_id: row.import_job_id,
      org_id: row.org_id,
      subject_id: row.import_subject_id,
      item: `Edited field ${row.target_field}${patch.target_field ? ` → ${patch.target_field}` : ""}`,
      traces_to: "admin_override",
      actor: context.userId,
      action: "edit_field",
    });
    return { ok: true };
  });

// ---------- Set dedup decision (update existing vs create new) ----------
const Decision = z.object({
  subjectId: z.string().uuid(),
  decision: z.enum(["update", "create_new", "skip"]),
});
export const setSubjectDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Decision.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj } = await sb.from("import_subjects").select("import_job_id, org_id").eq("id", data.subjectId).single();
    if (!subj) throw new Error("Subject not found");
    await sb.from("import_subjects")
      .update({ review_decision: data.decision, review_status: "in_progress" })
      .eq("id", data.subjectId);
    await sb.from("import_audit").insert({
      import_job_id: subj.import_job_id,
      org_id: subj.org_id,
      subject_id: data.subjectId,
      item: `Dedup decision: ${data.decision}`,
      traces_to: "admin_override",
      actor: context.userId,
      action: "set_decision",
    });
    return { ok: true };
  });

// ---------- Mark subject ready / approved ----------
const MarkReady = z.object({ subjectId: z.string().uuid(), ready: z.boolean() });
export const setSubjectReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MarkReady.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj } = await sb.from("import_subjects").select("import_job_id, org_id").eq("id", data.subjectId).single();
    if (!subj) throw new Error("Subject not found");
    await sb.from("import_subjects").update({
      review_status: data.ready ? "ready" : "in_progress",
      reviewed_by: data.ready ? context.userId : null,
      reviewed_at: data.ready ? new Date().toISOString() : null,
    }).eq("id", data.subjectId);
    await sb.from("import_audit").insert({
      import_job_id: subj.import_job_id,
      org_id: subj.org_id,
      subject_id: data.subjectId,
      item: data.ready ? "Marked subject ready" : "Reopened subject",
      traces_to: "admin_override",
      actor: context.userId,
      action: "mark_ready",
    });
    return { ok: true };
  });

// ---------- Cert document: upload (sets Verified) or admin sign-off (Provisional) ----------
const UpsertCert = z.object({
  subjectId: z.string().uuid(),
  cert_key: z.string().min(1).max(120),
  storage_path: z.string().optional(),
  file_name: z.string().optional(),
  expiry_date: z.string().optional(), // ISO date
  state: z.enum(["unverified", "verified", "provisional"]),
  notes: z.string().max(500).optional(),
});
export const upsertCertDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertCert.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj } = await sb.from("import_subjects").select("import_job_id, org_id").eq("id", data.subjectId).single();
    if (!subj) throw new Error("Subject not found");

    const { data: existing } = await sb.from("import_cert_documents")
      .select("id").eq("import_subject_id", data.subjectId).eq("cert_key", data.cert_key).maybeSingle();

    const row = {
      import_job_id: subj.import_job_id,
      import_subject_id: data.subjectId,
      org_id: subj.org_id,
      cert_key: data.cert_key,
      state: data.state,
      storage_path: data.storage_path ?? null,
      file_name: data.file_name ?? null,
      expiry_date: data.expiry_date ?? null,
      notes: data.notes ?? null,
      signed_off_by: data.state === "provisional" ? context.userId : null,
      signed_off_at: data.state === "provisional" ? new Date().toISOString() : null,
    };
    if (existing) await sb.from("import_cert_documents").update(row).eq("id", existing.id);
    else await sb.from("import_cert_documents").insert(row);

    await sb.from("import_audit").insert({
      import_job_id: subj.import_job_id,
      org_id: subj.org_id,
      subject_id: data.subjectId,
      item: `Cert ${data.cert_key} → ${data.state}`,
      traces_to: data.state === "verified" ? "source" : "admin_override",
      actor: context.userId,
      action: "cert_update",
    });
    return { ok: true };
  });

// ---------- Answer a NECTAR question ----------
const AnswerQ = z.object({ questionId: z.string().uuid(), answer: z.string().max(2000) });
export const answerNectarQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AnswerQ.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await sb.from("import_nectar_questions").update({
      answer: data.answer,
      answered_by: context.userId,
      answered_at: new Date().toISOString(),
    }).eq("id", data.questionId);
    return { ok: true };
  });

// ---------- File an unfiled item ----------
const FileUnfiled = z.object({
  itemId: z.string().uuid(),
  filed_to: z.string().nullable(), // null = leave
});
export const fileUnfiledItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FileUnfiled.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    await sb.from("unfiled_items").update({
      filed_to: data.filed_to,
      filed_by: data.filed_to ? context.userId : null,
      filed_at: data.filed_to ? new Date().toISOString() : null,
    }).eq("id", data.itemId);
    return { ok: true };
  });

// ---------- Compute provisioning forecast for a subject ----------
const Forecast = z.object({ subjectId: z.string().uuid() });
export const computeProvisioningForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Forecast.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj } = await sb.from("import_subjects")
      .select("id, import_job_id, org_id, subject_type").eq("id", data.subjectId).single();
    if (!subj) throw new Error("Subject not found");
    const { data: fields } = await sb.from("extracted_fields").select("target_field, value")
      .eq("import_subject_id", data.subjectId);
    const fieldMap = new Map<string, string>((fields ?? []).map((f: { target_field: string; value: string }) => [f.target_field, f.value ?? ""]));

    const { data: rules } = await sb.from("provisioning_rules")
      .select("id, trigger_type, trigger_value, action_type, target_module, default_state, applies_to, is_active, notes")
      .eq("org_id", subj.org_id).eq("is_active", true);

    const matchedRules: Array<{ rule_id: string; target_module: string; planned_action: string; state: string; reason: string }> = [];
    for (const r of rules ?? []) {
      if (r.applies_to !== "both" && r.applies_to !== subj.subject_type) continue;
      let match = false;
      let reason = "";
      if (r.trigger_type === "data_present") {
        if (fieldMap.has(r.trigger_value) && (fieldMap.get(r.trigger_value) ?? "").trim().length) {
          match = true;
          reason = `${r.trigger_value} present`;
        }
      } else if (r.trigger_type === "service_code" || r.trigger_type === "keyword") {
        for (const v of fieldMap.values()) {
          if (v && v.toLowerCase().includes(r.trigger_value.toLowerCase())) {
            match = true;
            reason = `Matched "${r.trigger_value}" in extracted data`;
            break;
          }
        }
      } else if (r.trigger_type === "role") {
        const pos = (fieldMap.get("position") ?? "").toLowerCase();
        if (r.trigger_value === "any" || pos.includes(r.trigger_value.toLowerCase())) {
          match = true;
          reason = r.trigger_value === "any" ? "Applies to all employees" : `Role: ${r.trigger_value}`;
        }
      }
      if (match) {
        matchedRules.push({
          rule_id: r.id,
          target_module: r.target_module,
          planned_action: r.action_type,
          state: r.default_state === "draft" ? "draft" : "will_create",
          reason,
        });
      }
    }

    // Replace existing forecast rows for this subject (forecast only — no real records)
    await sb.from("provisioning_plan").delete().eq("subject_id", data.subjectId).eq("attributed_to_admin", false);
    for (const m of matchedRules) {
      await sb.from("provisioning_plan").insert({
        import_job_id: subj.import_job_id,
        org_id: subj.org_id,
        subject_id: data.subjectId,
        rule_id: m.rule_id,
        target_module: m.target_module,
        planned_action: m.planned_action,
        state: m.state,
        reason: m.reason,
      });
    }
    const { data: plan } = await sb.from("provisioning_plan").select("*").eq("subject_id", data.subjectId);
    return { plan: plan ?? [] };
  });

// ---------- Toggle a plan item to N/A or add admin-override ----------
const TogglePlan = z.object({
  planId: z.string().uuid(),
  state: z.enum(["will_create", "draft", "added_by_admin", "na"]),
  override_note: z.string().max(500).optional(),
});
export const togglePlanItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TogglePlan.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row } = await sb.from("provisioning_plan").select("*").eq("id", data.planId).single();
    if (!row) throw new Error("Plan item not found");
    await sb.from("provisioning_plan").update({
      state: data.state,
      override_note: data.override_note ?? row.override_note,
      attributed_to_admin: data.state === "added_by_admin" || data.state === "na",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
    }).eq("id", data.planId);
    await sb.from("import_audit").insert({
      import_job_id: row.import_job_id,
      org_id: row.org_id,
      subject_id: row.subject_id,
      item: `Plan ${row.target_module} → ${data.state}`,
      traces_to: "admin_override",
      actor: context.userId,
      action: "toggle_plan",
    });
    return { ok: true };
  });

// ---------- Assignment map confirm/edit ----------
const ConfirmAssignment = z.object({
  assignmentId: z.string().uuid(),
  status: z.enum(["confirmed", "rejected", "edited"]),
});
export const confirmAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConfirmAssignment.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row } = await sb.from("assignment_map").select("*").eq("id", data.assignmentId).single();
    if (!row) throw new Error("Assignment not found");
    await sb.from("assignment_map").update({
      status: data.status,
      confirmed_by: context.userId,
      confirmed_at: new Date().toISOString(),
    }).eq("id", data.assignmentId);
    await sb.from("import_audit").insert({
      import_job_id: row.import_job_id,
      org_id: row.org_id,
      item: `Assignment ${row.relation_type} → ${data.status}`,
      traces_to: "admin_override",
      actor: context.userId,
      action: "confirm_assignment",
    });
    return { ok: true };
  });

// ---------- Submit job for setup ----------
// Self-service: the Company Admin IS the signer — commit immediately, reusing
// the same engine as the Done page's auto-run path. Idempotent.
// White-glove (HIVE migration): keep advisory-only; commit waits for the
// receiving company's admin sign-off on the Done screen.
export const submitForSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => JobId.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: job } = await sb
      .from("import_jobs")
      .select("org_id, status, source")
      .eq("id", data.jobId)
      .single();
    if (!job) throw new Error("Job not found");

    await sb.from("import_jobs").update({
      status: "submitted_for_setup",
      submitted_at: new Date().toISOString(),
      submitted_by: context.userId,
    }).eq("id", data.jobId);

    if (job.source === "white_glove") {
      await sb.from("import_audit").insert({
        import_job_id: data.jobId,
        org_id: job.org_id,
        item: "Submitted for setup — awaiting receiving company sign-off",
        traces_to: "admin_override",
        actor: context.userId,
        action: "submit_for_setup",
      });
      return { ok: true, committed: false };
    }

    const { runJobCommit } = await import("./smart-import-commit.functions");
    const result = await runJobCommit(sb, context.userId, data.jobId);

    await sb.from("import_audit").insert({
      import_job_id: data.jobId,
      org_id: job.org_id,
      item: result.jobCommitted
        ? "Submitted for setup — records committed by admin"
        : "Submitted for setup — partial commit (see per-subject errors)",
      traces_to: "admin_override",
      actor: context.userId,
      action: "submit_for_setup",
    });

    return { ok: true, committed: result.jobCommitted, results: result.results };
  });

// ---------- Quick "complete missing info" fix from the Done page ----------
// Upserts admin-supplied values into extracted_fields for a single client
// subject so the next commit can succeed. Currently scoped to guardianship +
// emergency contact, which are the commit-blocking gaps surfaced in the UI.
const MissingClientFields = z.object({
  subjectId: z.string().uuid(),
  values: z.object({
    is_own_guardian: z.boolean(),
    guardian_name: z.string().max(200).optional(),
    guardian_phone: z.string().max(50).optional(),
    guardian_relationship: z.string().max(100).optional(),
    guardian_email: z.string().max(200).optional(),
    emergency_contact_name: z.string().max(200).optional(),
    emergency_contact_phone: z.string().max(50).optional(),
  }),
});
const MISSING_CLIENT_TARGETS = [
  "is_own_guardian",
  "guardian_name",
  "guardian_phone",
  "guardian_relationship",
  "guardian_email",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;
export const applyMissingClientFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MissingClientFields.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj } = await sb
      .from("import_subjects")
      .select("import_job_id, org_id, subject_type")
      .eq("id", data.subjectId)
      .single();
    if (!subj) throw new Error("Subject not found");
    if (subj.subject_type !== "client") throw new Error("Only client subjects are supported here.");

    const isOwn = !!data.values.is_own_guardian;
    const payload: Record<string, string> = {
      is_own_guardian: isOwn ? "true" : "false",
      guardian_name: isOwn ? "" : (data.values.guardian_name ?? "").trim(),
      guardian_phone: isOwn ? "" : (data.values.guardian_phone ?? "").trim(),
      guardian_relationship: isOwn ? "" : (data.values.guardian_relationship ?? "").trim(),
      guardian_email: isOwn ? "" : (data.values.guardian_email ?? "").trim(),
      emergency_contact_name: (data.values.emergency_contact_name ?? "").trim(),
      emergency_contact_phone: (data.values.emergency_contact_phone ?? "").trim(),
    };

    for (const target of MISSING_CLIENT_TARGETS) {
      const value = payload[target] ?? "";
      const { data: existing } = await sb
        .from("extracted_fields")
        .select("id, value, original_value")
        .eq("import_subject_id", data.subjectId)
        .eq("target_field", target)
        .maybeSingle();
      if (existing) {
        await sb.from("extracted_fields").update({
          value,
          original_value: existing.original_value ?? existing.value,
          status: "edited",
          provenance: "admin_override",
          edited_by: context.userId,
          edited_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await sb.from("extracted_fields").insert({
          import_job_id: subj.import_job_id,
          org_id: subj.org_id,
          import_subject_id: data.subjectId,
          target_table: "clients",
          target_field: target,
          value,
          status: "edited",
          confidence: 1,
          provenance: "admin_override",
          is_custom_attribute: false,
          edited_by: context.userId,
          edited_at: new Date().toISOString(),
        });
      }
    }

    // Clear the stale commit error so the UI stops surfacing it after retry.
    await sb.from("import_subjects").update({ commit_error: null }).eq("id", data.subjectId);

    await sb.from("import_audit").insert({
      import_job_id: subj.import_job_id,
      org_id: subj.org_id,
      subject_id: data.subjectId,
      item: isOwn
        ? "Completed missing info — client marked as their own guardian"
        : "Completed missing info — guardian details supplied",
      traces_to: "admin_override",
      actor: context.userId,
      action: "complete_missing_info",
    });

    return { ok: true };
  });
