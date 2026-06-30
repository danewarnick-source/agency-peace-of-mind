// Smart Import COMMIT — Prompt 4.
// Per-subject atomic apply: create/update profile, attach custom attrs,
// stamp provenance, queue cert + module provisioning, file scraps,
// wire assignment map. Idempotent (guarded by committed_at / committed_record_id).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { z } from "zod";
import { applyExtractedFieldsToClient } from "@/lib/client-import-schema";
import { validateClientDraft, filterBlocking, normalizeGuardianFields, type ClientDraft } from "@/lib/import-validation";
import { fetchTenantIdentity, type TenantIdentity } from "@/lib/service-classification";


const JobId = z.object({ jobId: z.string().uuid() });

// Map of extracted target_field -> column on clients
const CLIENT_COL: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  phone: "phone_number",
  address: "physical_address",
  medicaid_id: "medicaid_id",
  date_of_birth: "date_of_birth",
  is_own_guardian: "is_own_guardian",
  guardian_name: "guardian_name",
  guardian_phone: "guardian_phone",
  guardian_relationship: "guardian_relationship",
  guardian_email: "guardian_email",
  emergency_contact_name: "emergency_contact_name",
  emergency_contact_phone: "emergency_contact_phone",
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

// Commit a single pending subject (used by the Pending Clients workspace's
// "Save & finalize" path). Same engine; just filters candidates to one
// row so unrelated ready siblings are not auto-committed.
const SingleSubject = z.object({ subjectId: z.string().uuid() });
export const commitSingleSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SingleSubject.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: subj, error } = await sb
      .from("import_subjects")
      .select("id, import_job_id, org_id")
      .eq("id", data.subjectId)
      .single();
    if (error || !subj) throw new Error("Subject not found");
    const { data: job } = await sb
      .from("import_jobs")
      .select("id, org_id, target_org_id, source")
      .eq("id", subj.import_job_id)
      .single();
    const orgId = (job?.source === "white_glove" ? job.target_org_id : job?.org_id) as string;
    if (!orgId) throw new Error("Job has no organization to commit into.");
    await requireOrgMembership(sb, context.userId, orgId, "admin");
    return runJobCommit(sb, context.userId, subj.import_job_id, { subjectId: data.subjectId });
  });

// Internal helper — usable from other server fns (e.g. submitForSetup) so
// the self-service path can commit in one shot without re-entering the
// server-fn boundary. `opts.subjectId` narrows the commit to a single
// subject (workspace per-row finalize); without it, all ready subjects in
// the job are attempted as before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runJobCommit(sbIn: any, userId: string, jobId: string, opts?: { subjectId?: string }) {
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

    let subjectsQ = sb
      .from("import_subjects")
      .select("*")
      .eq("import_job_id", jobId);
    if (opts?.subjectId) subjectsQ = subjectsQ.eq("id", opts.subjectId);
    const { data: subjects } = await subjectsQ;

    const orgId = (job.source === "white_glove" ? job.target_org_id : job.org_id) as string;
    const results: Array<{
      subjectId: string;
      display_name: string;
      committed: boolean;
      record_id: string | null;
      gaps: string[];
      error?: string;
    }> = [];

    const tenantIdentity: TenantIdentity = orgId
      ? await fetchTenantIdentity(sb, orgId)
      : { codesHeld: [], names: [] };

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

      // Never silent-merge two different people. An ambiguous match without an
      // explicit admin decision must block at commit time.
      if (subj.match_status === "ambiguous" && !subj.review_decision) {
        const msg = "Ambiguous match — admin must pick update vs create_new.";
        await sb.from("import_subjects").update({ commit_error: msg }).eq("id", subj.id);
        await audit(sb, jobId, orgId, subj.id, msg, "admin_override", userId, "ambiguous_unresolved");
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: false, record_id: null, gaps: [msg] });
        continue;
      }

      // ── Triple-check validation gate (pre-write) ───────────────────────
      // Reuse the same validator the review screen uses; honor admin overrides.
      try {
        const { data: subjFields } = await sb
          .from("extracted_fields")
          .select("target_field, value")
          .eq("import_subject_id", subj.id)
          .is("dismissed_at", null);
        const draft = buildClientDraftFromFields(subjFields ?? []);
        const { issues } = validateClientDraft(draft, { tenant: tenantIdentity });
        const overrides = (subj.validation_overrides as Record<string, boolean>) ?? {};
        const blocking = filterBlocking(issues, overrides);
        if (blocking.length > 0) {
          const msg = `NECTAR validation blocked commit: ${blocking.map((b) => b.message).join(" | ")}`;
          await sb.from("import_subjects").update({ commit_error: msg }).eq("id", subj.id);
          await audit(sb, jobId, orgId, subj.id, msg, "admin_override", userId, "validation_blocked");
          results.push({ subjectId: subj.id, display_name: subj.display_name, committed: false, record_id: null, gaps: blocking.map((b) => b.message) });
          continue;
        }
      } catch (e) {
        // A validator failure must NEVER silently allow a commit. Log + skip.
        const msg = `Validator threw: ${(e as Error).message}`;
        await audit(sb, jobId, orgId, subj.id, msg, "admin_override", userId, "validation_error");
        results.push({ subjectId: subj.id, display_name: subj.display_name, committed: false, record_id: null, gaps: [msg] });
        continue;
      }


      try {
        const { data: fields } = await sb.from("extracted_fields")
          .select("*").eq("import_subject_id", subj.id).neq("status", "ignored").is("dismissed_at", null);
        const fieldsList = fields ?? [];

        let recordId: string | null = null;

        if (subj.subject_type === "client") {
          recordId = await commitClient(sb, orgId, subj, fieldsList, jobId, userId, gaps, tenantIdentity);
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

    // When committing a single subject in isolation, results only describes
    // that subject — re-check job-wide pending count before marking the whole
    // job committed.
    let jobCommitted = (results || []).filter((r) => !r.committed).length === 0;
    if (jobCommitted && opts?.subjectId) {
      const { count: stillOpenJobWide } = await sb
        .from("import_subjects")
        .select("id", { count: "exact", head: true })
        .eq("import_job_id", jobId)
        .is("committed_at", null)
        .is("discarded_at", null);
      jobCommitted = (stillOpenJobWide ?? 0) === 0;
    }
    if (jobCommitted) {
      await sb.from("import_jobs").update({
        status: "committed",
        committed_at: new Date().toISOString(),
        committed_by: userId,
      }).eq("id", jobId);
    }

    return { results, jobCommitted };
}



// --------------------------------------------------------------
async function commitClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  subj: { id: string; matched_record_id: string | null; review_decision: string | null; display_name: string; validation_overrides?: Record<string, boolean> | null },
  fields: Array<{ id: string; target_field: string; value: string | null; source_document_id: string | null; source_snippet: string | null; provenance: string; is_custom_attribute: boolean }>,
  jobId: string,
  userId: string,
  gaps: string[],
  tenant?: TenantIdentity,
): Promise<string> {
  const mapped: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.is_custom_attribute) continue;
    const col = CLIENT_COL[f.target_field];
    if (!col) continue;
    mapped[col] = f.value;
  }

  // Coerce/normalize guardianship via the shared helper so the trigger,
  // validator, and reviewer agree on what "self-guardian" means.
  const normalize = (m: Record<string, unknown>, defaultSelf: boolean) => {
    const guardianTouched =
      "is_own_guardian" in m ||
      "guardian_name" in m ||
      "guardian_phone" in m ||
      "guardian_relationship" in m ||
      "guardian_email" in m;
    if (!guardianTouched) return; // non-destructive on update path
    // Coerce string booleans first so normalizeGuardianFields sees real bools.
    if (m.is_own_guardian === "true") m.is_own_guardian = true;
    else if (m.is_own_guardian === "false") m.is_own_guardian = false;
    if (
      defaultSelf &&
      (m.is_own_guardian === undefined || m.is_own_guardian === null)
    ) {
      m.is_own_guardian = true;
    }
    normalizeGuardianFields(m as ClientDraft & {
      guardian_phone?: string | null;
      guardian_relationship?: string | null;
      guardian_email?: string | null;
    });
  };

  let recordId: string;
  if (subj.matched_record_id && subj.review_decision === "update") {
    recordId = subj.matched_record_id;
    if (Object.keys(mapped).length > 0) {
      normalize(mapped, false);
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
    // Default to self-guardian on new clients unless a real guardian is named.
    normalize(mapped, true);
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

  // Run the shared autofill so Smart Import seeds billing codes, goals,
  // health arrays, etc. — same path as the per-client upload flow.
  // The Smart Import extractor encodes structured values as JSON in `value`
  // (billing_code_row, arrays, booleans); decode them back here so
  // applyExtractedFieldsToClient sees value_json / value_array / value_bool.
  try {
    type NormField = {
      field_key: string;
      value_text?: string | null;
      value_json?: unknown;
      value_array?: string[] | null;
      value_bool?: boolean | null;
      confidence: number;
    };
    const norm: NormField[] = fields
      .filter((f) => !f.is_custom_attribute)
      .map((f) => {
        const base: NormField = { field_key: f.target_field, confidence: 0.9 };
        const v = f.value;
        if (v == null || String(v).trim() === "") return base;
        const s = String(v).trim();
        if (f.target_field === "billing_code_row") {
          try { base.value_json = JSON.parse(s); return base; } catch { /* fall through */ }
        }
        if (s.startsWith("[") || s.startsWith("{")) {
          try {
            const j = JSON.parse(s);
            if (Array.isArray(j)) { base.value_array = j.map(String); return base; }
            if (j && typeof j === "object") {
              if (typeof (j as { bool?: unknown }).bool === "boolean") {
                base.value_bool = (j as { bool: boolean }).bool;
                return base;
              }
              base.value_json = j;
              return base;
            }
          } catch { /* fall through */ }
        }
        base.value_text = s;
        return base;
      });
    // Infer source document type from the extracted fields (good enough for the
    // authoritative-source rules — see client-import-schema for full semantics).
    const inferredType: "1056_budget" | "pcsp" | "other" =
      norm.some((n) => n.field_key === "form_1056_number" || n.field_key === "form_1056_approved_date")
        ? "1056_budget"
        : norm.some((n) => n.field_key === "pcsp_goal" || n.field_key === "pcsp_has_medications")
        ? "pcsp"
        : "other";
    const apply = await applyExtractedFieldsToClient({
      supabase: sb,
      organizationId: orgId,
      clientId: recordId,
      fields: norm,
      sourceDocumentType: inferredType,
      importJobId: jobId,
      tenant: tenant ?? { codesHeld: [], names: [] },
      overrides: (subj.validation_overrides as Record<string, boolean> | null) ?? {},
      onError: async (action, message) => {
        await audit(sb, jobId, orgId, subj.id, message, "admin_override", userId, action);
      },
    });
    gaps.push(...apply.suggested.map((s) => `Review: ${s}`));
  } catch (err) {
    gaps.push(`Autofill warning: ${(err as Error).message}`);
    await audit(sb, jobId, orgId, subj.id,
      `Autofill failed: ${(err as Error).message}`,
      "admin_override", userId, "autofill_error");
  }

  // ─── PCSP single-source-of-truth ──────────────────────────────────────
  // If this subject's PCSP-typed fields trace to one or more
  // import_documents, copy each file into the client-documents bucket and
  // register a client_documents row (document_type='pcsp') for this client.
  // After this, the same document is visible in BOTH Care and Files with
  // no re-upload needed. Idempotent: skipped if a row with the same
  // file_name already exists for this client.
  try {
    const pcspFieldPrefix = (k: string) => k.startsWith("pcsp_");
    const pcspDocIds = Array.from(new Set(
      fields
        .filter((f) => pcspFieldPrefix(f.target_field) && f.source_document_id)
        .map((f) => f.source_document_id as string),
    ));
    if (pcspDocIds.length > 0) {
      const { data: importDocs } = await sb
        .from("import_documents")
        .select("id, storage_path, file_name, file_type")
        .in("id", pcspDocIds);
      for (const doc of (importDocs ?? []) as Array<{
        id: string; storage_path: string; file_name: string; file_type: string | null;
      }>) {
        if (!doc?.storage_path) continue;
        const { data: existing } = await sb
          .from("client_documents")
          .select("id")
          .eq("client_id", recordId)
          .eq("file_name", doc.file_name)
          .ilike("document_type", "pcsp")
          .limit(1)
          .maybeSingle();
        if (existing?.id) continue;
        const dl = await sb.storage.from("import-documents").download(doc.storage_path);
        if (dl.error || !dl.data) {
          gaps.push(`PCSP copy skipped (${doc.file_name}): ${dl.error?.message ?? "no file"}`);
          continue;
        }
        const safe = (doc.file_name || "pcsp.pdf").replace(/[^\w.\-]+/g, "_");
        const destPath = `${orgId}/${recordId}/pcsp/${Date.now()}_${safe}`;
        const up = await sb.storage.from("client-documents").upload(destPath, dl.data, {
          contentType: doc.file_type || "application/pdf",
          upsert: false,
        });
        if (up.error) {
          gaps.push(`PCSP copy failed (${doc.file_name}): ${up.error.message}`);
          continue;
        }
        const { error: insErr } = await sb.from("client_documents").insert({
          client_id: recordId,
          organization_id: orgId,
          document_type: "pcsp",
          file_name: doc.file_name,
          file_url: destPath,
          storage_path: destPath,
          uploaded_by: userId,
        });
        if (insErr) {
          gaps.push(`PCSP register failed (${doc.file_name}): ${insErr.message}`);
        }
      }
    }
  } catch (err) {
    gaps.push(`PCSP carry-over warning: ${(err as Error).message}`);
  }

  return recordId;
}

// Helper for the pre-commit validation gate. Builds a minimal ClientDraft
// from extracted_fields rows so the same validator the review screen uses
// can also run server-side immediately before write.
function buildClientDraftFromFields(
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
              provider_name: j.provider_name ? String(j.provider_name) : null,
            });
          }
        } catch { /* malformed row — validator only checks codes it can read */ }
        break;
    }
  }
  if (codes.length) d.billing_codes = codes;
  return d;
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
      .select("id, display_name, subject_type, match_status, review_decision, review_status, committed_at, committed_record_id, commit_error")
      .eq("import_job_id", data.jobId).order("created_at");

    const subjectSummaries: Array<{
      id: string; display_name: string; subject_type: string; committed: boolean;
      record_id: string | null; error: string | null; review_status: string;
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
        review_status: s.review_status ?? "pending",
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
