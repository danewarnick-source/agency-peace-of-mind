// Thin server fns used by ImportChecklist + NectarAsk. Each one is
// org-scoped via the user's organization_members row for the client.
//
// Honest scope: these fns persist data the admin enters / attaches in the
// done-page checklist. They do NOT perform document extraction — upload
// only attaches the file. Extraction is wired in a later prompt.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function requireAdminForClient(
  sb: Sb,
  userId: string,
  clientId: string,
): Promise<string> {
  const { data: client } = await sb
    .from("clients")
    .select("organization_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) throw new Error("Client not found");
  const { data: membership } = await sb
    .from("organization_members")
    .select("role")
    .eq("organization_id", client.organization_id)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) throw new Error("Forbidden");
  const role = String((membership as { role: string }).role ?? "").toLowerCase();
  if (!["admin", "manager", "owner", "super_admin"].includes(role)) {
    throw new Error("Forbidden");
  }
  return client.organization_id as string;
}

// ── End-of-life statuses (DNR / POLST / palliative / hospice) ────────────
const EOL_FIELDS = ["dnr_status", "polst_status", "palliative_care_status", "hospice_status"] as const;
type EolField = (typeof EOL_FIELDS)[number];

export const setEndOfLifeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        field: z.enum(EOL_FIELDS),
        status: z.string().min(1).max(80),
        location: z.string().max(200).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const patch: Record<string, unknown> = { [data.field as EolField]: data.status };
    if (data.field === "dnr_status") {
      patch.dnr_location = data.location ?? null;
    }
    const { error } = await sb.from("clients").update(patch).eq("id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

// ── Append to clients array fields (allergies, immunizations) ────────────
export const appendClientArrayField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        field: z.enum(["allergies", "immunizations"]),
        value: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: row } = await sb
      .from("clients")
      .select(data.field)
      .eq("id", data.clientId)
      .maybeSingle();
    const current = (row?.[data.field] as string[] | null) ?? [];
    const next = Array.from(new Set([...current, data.value.trim()]));
    const { error } = await sb
      .from("clients")
      .update({ [data.field]: next })
      .eq("id", data.clientId);
    if (error) throw error;
    return { ok: true, count: next.length };
  });

// ── Upsert one client_medications row (manual fill-in path) ──────────────
export const upsertClientMedication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        medicationId: z.string().uuid().optional(),
        medication_name: z.string().min(1).max(200),
        dosage: z.string().max(120).optional().nullable(),
        am_pm: z.string().max(40).optional().nullable(),
        scheduled_time: z.string().max(80).optional().nullable(),
        prescriber: z.string().max(120).optional().nullable(),
        support_level: z.string().max(80).optional().nullable(),
        support_explanation: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);
    const row = {
      client_id: data.clientId,
      organization_id: orgId,
      medication_name: data.medication_name,
      dosage: data.dosage ?? null,
      am_pm: data.am_pm ?? null,
      scheduled_time: data.scheduled_time ?? null,
      prescriber: data.prescriber ?? null,
      support_level: data.support_level ?? null,
      support_explanation: data.support_explanation ?? null,
    };
    if (data.medicationId) {
      const { error } = await sb
        .from("client_medications")
        .update(row)
        .eq("id", data.medicationId);
      if (error) throw error;
      return { ok: true, id: data.medicationId };
    }
    const { data: ins, error } = await sb
      .from("client_medications")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id as string };
  });

// ── Attach an uploaded document to the client profile ────────────────────
// Records the file in client_documents. Extraction is a separate step
// (extractAndApplyClientUpload below) so the attach succeeds even when the
// file is a scanned PDF or otherwise unreadable.
export const attachClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        documentType: z.string().min(1).max(80),
        fileName: z.string().min(1).max(300),
        storagePath: z.string().min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: ins, error } = await sb
      .from("client_documents")
      .insert({
        client_id: data.clientId,
        organization_id: orgId,
        document_type: data.documentType,
        file_name: data.fileName,
        file_url: data.storagePath, // signed URLs are created on demand
        storage_path: data.storagePath,
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id as string };
  });

// ── Extract + apply an uploaded document to the client ───────────────────
// Downloads the file the admin just uploaded via NectarAsk, runs it through
// the shared NECTAR extractor with a category hint, and writes the results
// to the right tables. The file is ALREADY attached (via
// attachClientDocument); this fn only reads + applies content.
//
// Honest scope: this is best-effort. If the file is a scanned PDF or
// otherwise unreadable, the attach already succeeded and the admin can
// fill values manually — we return { ok: true, applied: false } with a
// reason instead of throwing.
const ExtractApplyInput = z.object({
  clientId: z.string().uuid(),
  documentType: z.enum([
    "pcsp", "1056_budget", "mar", "bsp",
    "immunization", "allergy",
    "dnr", "polst", "palliative", "hospice",
    "grievance_acknowledgment", "hrc_approval",
    "other",
  ]),
  storagePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(300),
  bucket: z.string().min(1).max(80).default("client-documents"),
});

export const extractAndApplyClientUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ExtractApplyInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);

    // 1) Download
    const { data: file, error: dlErr } = await sb.storage
      .from(data.bucket)
      .download(data.storagePath);
    if (dlErr || !file) {
      return { ok: true, applied: false, reason: `download failed: ${dlErr?.message ?? "no file"}` };
    }
    const buf = Buffer.from(await file.arrayBuffer());

    // 2) Text
    const { extractTextFromUpload } = await import("@/lib/document-text.server");
    const text = await extractTextFromUpload(buf, data.fileName);
    if (!text || text.trim().length < 20) {
      return {
        ok: true,
        applied: false,
        reason: "NECTAR couldn't read the document text (scanned PDF?). The file is attached; please fill values manually.",
      };
    }

    // 3) Extract via the shared NECTAR extractor with a category hint
    const { parseDocumentWithAI } = await import("@/lib/document-extraction");
    const parsed = await parseDocumentWithAI(text, `documentType=${data.documentType}`);
    const fields = (parsed.fields ?? []).map((f) => ({
      field_key: f.field_key,
      value_text: f.value_text ?? null,
      value_number: f.value_number ?? null,
      value_date: f.value_date ?? null,
      value_bool: f.value_bool ?? null,
      value_array: f.value_array ?? null,
      value_json: f.value_json ?? null,
      confidence: f.confidence ?? 0.85,
    }));

    // 4) Apply, with audit-on-error so nothing vanishes
    const { applyExtractedFieldsToClient } = await import("@/lib/client-import-schema");
    const summary = await applyExtractedFieldsToClient({
      supabase: sb,
      organizationId: orgId,
      clientId: data.clientId,
      fields,
      sourceDocumentType: data.documentType,
      onError: async (action, message) => {
        try {
          await sb.from("import_audit").insert({
            org_id: orgId,
            item: `[checklist-upload] ${data.documentType} ${data.fileName}: ${message}`,
            traces_to: "inferred",
            actor: context.userId,
            action,
          });
        } catch { /* never let audit failure break a save */ }
      },
    });

    return {
      ok: true,
      applied: true,
      autofilled: summary.autofilled,
      suggested: summary.suggested,
      customCreated: summary.customCreated,
      fieldCount: fields.length,
    };
  });

// ── Profile-tab "Update info from document" (review-then-apply) ──────────
// Two-step alternative to extractAndApplyClientUpload: previews the diff,
// then applies only the fields the admin checks. Reuses the same NECTAR
// extractor + applyExtractedFieldsToClient writer; nothing is written until
// applySelectedClientFields runs.

// field_key (as emitted by parseDocumentWithAI) → clients column + label.
// Matches the mappings in applyExtractedFieldsToClient.
const PROFILE_FIELD_MAP: Record<string, { column: string; label: string; kind: "text" | "bool" | "date" | "array" }> = {
  first_name: { column: "first_name", label: "First name", kind: "text" },
  last_name: { column: "last_name", label: "Last name", kind: "text" },
  dob: { column: "date_of_birth", label: "Date of birth", kind: "date" },
  medicaid_id: { column: "medicaid_id", label: "Medicaid ID", kind: "text" },
  phone: { column: "phone_number", label: "Phone", kind: "text" },
  physical_address: { column: "physical_address", label: "Physical address", kind: "text" },
  emergency_contact_name: { column: "emergency_contact_name", label: "Emergency contact name", kind: "text" },
  emergency_contact_phone: { column: "emergency_contact_phone", label: "Emergency contact phone", kind: "text" },
  emergency_contact_instructions: { column: "emergency_contact_instructions", label: "Emergency contact instructions", kind: "text" },
  emergency_contact_2_name: { column: "emergency_contact_2_name", label: "Emergency contact #2 name", kind: "text" },
  emergency_contact_2_phone: { column: "emergency_contact_2_phone", label: "Emergency contact #2 phone", kind: "text" },
  emergency_contact_2_instructions: { column: "emergency_contact_2_instructions", label: "Emergency contact #2 instructions", kind: "text" },
  is_own_guardian: { column: "is_own_guardian", label: "Own guardian", kind: "bool" },
  guardian_name: { column: "guardian_name", label: "Guardian name", kind: "text" },
  guardian_phone: { column: "guardian_phone", label: "Guardian phone", kind: "text" },
  guardian_relationship: { column: "guardian_relationship", label: "Guardian relationship", kind: "text" },
  guardian_email: { column: "guardian_email", label: "Guardian email", kind: "text" },
  guardian_address: { column: "guardian_address", label: "Guardian address", kind: "text" },
  clinical_alert: { column: "special_directions", label: "Clinical alert / special directions", kind: "text" },
  special_directions: { column: "special_directions", label: "Special directions", kind: "text" },
  dysphagia: { column: "dysphagia", label: "Dysphagia", kind: "bool" },
  self_admin_med_support: { column: "self_admin_med_support", label: "Self-administer med support", kind: "bool" },
  allergies: { column: "allergies", label: "Allergies", kind: "array" },
  swallowing_alerts: { column: "swallowing_alerts", label: "Swallowing alerts", kind: "array" },
  support_coordinator_name: { column: "support_coordinator_name", label: "Support coordinator name", kind: "text" },
  support_coordinator_email: { column: "support_coordinator_email", label: "Support coordinator email", kind: "text" },
  support_coordinator_phone: { column: "support_coordinator_phone", label: "Support coordinator phone", kind: "text" },
  primary_care_name: { column: "primary_care_name", label: "Primary care name", kind: "text" },
  primary_care_phone: { column: "primary_care_phone", label: "Primary care phone", kind: "text" },
  neurologist_name: { column: "neurologist_name", label: "Neurologist name", kind: "text" },
  neurologist_phone: { column: "neurologist_phone", label: "Neurologist phone", kind: "text" },
  dentist_name: { column: "dentist_name", label: "Dentist name", kind: "text" },
  dentist_phone: { column: "dentist_phone", label: "Dentist phone", kind: "text" },
  prescriber_name: { column: "prescriber_name", label: "Prescriber name", kind: "text" },
  prescriber_phone: { column: "prescriber_phone", label: "Prescriber phone", kind: "text" },
  bsp_status: { column: "bsp_status", label: "BSP status", kind: "text" },
  medical_insurance: { column: "medical_insurance", label: "Medical insurance", kind: "text" },
  housing_voucher: { column: "housing_voucher", label: "Housing voucher", kind: "text" },
  preferred_living: { column: "preferred_living", label: "Preferred living", kind: "text" },
  plan_year: { column: "plan_year", label: "Plan year", kind: "text" },
  disability_category: { column: "disability_category", label: "Disability category", kind: "text" },
  staff_ratio: { column: "staff_ratio", label: "Staff ratio", kind: "text" },
  level_of_need: { column: "level_of_need", label: "Level of need", kind: "text" },
  dnr_status: { column: "dnr_status", label: "DNR status", kind: "text" },
  dnr_location: { column: "dnr_location", label: "DNR location", kind: "text" },
  polst_status: { column: "polst_status", label: "POLST status", kind: "text" },
  palliative_care_status: { column: "palliative_care_status", label: "Palliative care status", kind: "text" },
  hospice_status: { column: "hospice_status", label: "Hospice status", kind: "text" },
  advanced_directives: { column: "advanced_directives", label: "Advanced directives", kind: "bool" },
  emergency_medical_treatment_authorization: { column: "emergency_medical_treatment_authorization", label: "Emergency medical treatment authorization", kind: "bool" },
  grievance_acknowledged: { column: "grievance_acknowledged", label: "Grievance acknowledged", kind: "bool" },
  grievance_signed_date: { column: "grievance_signed_date", label: "Grievance signed date", kind: "date" },
  diagnoses: { column: "diagnoses", label: "Diagnoses", kind: "array" },
  chronic_conditions: { column: "chronic_conditions", label: "Chronic conditions", kind: "array" },
  immunizations: { column: "immunizations", label: "Immunizations", kind: "array" },
  court_orders: { column: "court_orders", label: "Court orders", kind: "array" },
  rights_restrictions: { column: "rights_restrictions", label: "Rights restrictions", kind: "array" },
  preferred_activities: { column: "preferred_activities", label: "Preferred activities", kind: "array" },
  roommates: { column: "roommates", label: "Roommates", kind: "array" },
  personal_belongings_inventory: { column: "personal_belongings_inventory", label: "Personal belongings inventory", kind: "array" },
  admission_date: { column: "admission_date", label: "Admission date", kind: "date" },
  discharge_date: { column: "discharge_date", label: "Discharge date", kind: "date" },
  form_1056_number: { column: "form_1056_number", label: "1056 form number", kind: "text" },
  form_1056_approved_date: { column: "form_1056_approved_date", label: "1056 approved date", kind: "date" },
};

const CONFIDENCE_THRESHOLD = 0.6;

function displayFromField(meta: { kind: "text" | "bool" | "date" | "array" }, f: {
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_bool?: boolean | null;
  value_array?: string[] | null;
}): string {
  if (meta.kind === "bool") {
    if (f.value_bool === true) return "Yes";
    if (f.value_bool === false) return "No";
    return "";
  }
  if (meta.kind === "date") {
    return (f.value_date ?? f.value_text ?? "").toString().slice(0, 10);
  }
  if (meta.kind === "array") {
    return (f.value_array ?? []).filter(Boolean).join(", ");
  }
  if (f.value_text) return f.value_text;
  if (f.value_number !== null && f.value_number !== undefined) return String(f.value_number);
  return "";
}

function displayFromCurrent(meta: { kind: "text" | "bool" | "date" | "array" }, cur: unknown): string | null {
  if (cur === null || cur === undefined || cur === "") return null;
  if (meta.kind === "bool") return cur === true ? "Yes" : cur === false ? "No" : null;
  if (meta.kind === "array") {
    const arr = Array.isArray(cur) ? cur : [];
    if (!arr.length) return null;
    return arr.filter(Boolean).join(", ");
  }
  if (meta.kind === "date") return String(cur).slice(0, 10);
  return String(cur);
}

const PreviewInput = z.object({
  clientId: z.string().uuid(),
  documentType: z.string().min(1).max(80),
  fileName: z.string().min(1).max(300),
  storagePath: z.string().min(1).max(500),
  bucket: z.string().min(1).max(80).default("client-documents"),
});

export const previewClientUpdateFromDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PreviewInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);

    const { data: file, error: dlErr } = await sb.storage
      .from(data.bucket)
      .download(data.storagePath);
    if (dlErr || !file) {
      return { ok: false as const, reason: `Could not download file: ${dlErr?.message ?? "no file"}` };
    }
    const buf = Buffer.from(await file.arrayBuffer());

    const { extractTextFromUpload } = await import("@/lib/document-text.server");
    const text = await extractTextFromUpload(buf, data.fileName);
    if (!text || text.trim().length < 20) {
      return {
        ok: false as const,
        reason: "NECTAR couldn't read the document text (scanned PDF?). Try a text-based PDF or fill values manually.",
      };
    }

    const { parseDocumentWithAI } = await import("@/lib/document-extraction");
    const parsed = await parseDocumentWithAI(text, `documentType=${data.documentType}`);
    const rawFields = (parsed.fields ?? []).map((f) => ({
      field_key: f.field_key,
      value_text: f.value_text ?? null,
      value_number: f.value_number ?? null,
      value_date: f.value_date ?? null,
      value_bool: f.value_bool ?? null,
      value_array: f.value_array ?? null,
      value_json: f.value_json ?? null,
      confidence: f.confidence ?? 0.85,
    }));

    // Project the columns we might compare against.
    const columns = Array.from(new Set(Object.values(PROFILE_FIELD_MAP).map((m) => m.column)));
    const { data: client } = await sb
      .from("clients")
      .select(["id", ...columns].join(","))
      .eq("id", data.clientId)
      .maybeSingle();
    const row = (client ?? {}) as Record<string, unknown>;

    type Proposal = {
      field_key: string;
      label: string;
      incomingValue: string;
      currentValue: string | null;
      changed: boolean;
      confidence: number;
      field: typeof rawFields[number];
    };
    const proposals: Proposal[] = [];
    const seen = new Set<string>();
    for (const f of rawFields) {
      if ((f.confidence ?? 0) < CONFIDENCE_THRESHOLD) continue;
      const meta = PROFILE_FIELD_MAP[f.field_key];
      if (!meta) continue; // skip complex/structured (billing rows, meds, pcsp_goal)
      if (seen.has(f.field_key)) continue;
      seen.add(f.field_key);
      const incoming = displayFromField(meta, f).trim();
      if (!incoming) continue;
      const current = displayFromCurrent(meta, row[meta.column]);
      const changed = (current ?? "") !== incoming;
      proposals.push({
        field_key: f.field_key,
        label: meta.label,
        incomingValue: incoming,
        currentValue: current,
        changed,
        confidence: f.confidence ?? 0.85,
        field: f,
      });
    }
    // Stable order: changed first, then alphabetical by label.
    proposals.sort((a, b) =>
      a.changed === b.changed ? a.label.localeCompare(b.label) : a.changed ? -1 : 1,
    );
    return { ok: true as const, proposals };
  });

const ApplySelectedInput = z.object({
  clientId: z.string().uuid(),
  fields: z.array(
    z.object({
      field_key: z.string().min(1).max(120),
      value_text: z.string().nullable().optional(),
      value_number: z.number().nullable().optional(),
      value_date: z.string().nullable().optional(),
      value_bool: z.boolean().nullable().optional(),
      value_array: z.array(z.string()).nullable().optional(),
      value_json: z.unknown().optional(),
      confidence: z.number().nullable().optional(),
    }),
  ).max(200),
});

export const applySelectedClientFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ApplySelectedInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);

    const fields = data.fields.map((f) => ({
      field_key: f.field_key,
      value_text: f.value_text ?? null,
      value_number: f.value_number ?? null,
      value_date: f.value_date ?? null,
      value_bool: f.value_bool ?? null,
      value_array: f.value_array ?? null,
      value_json: f.value_json ?? null,
      confidence: f.confidence ?? 0.95,
    }));

    const { applyExtractedFieldsToClient } = await import("@/lib/client-import-schema");
    const summary = await applyExtractedFieldsToClient({
      supabase: sb,
      organizationId: orgId,
      clientId: data.clientId,
      fields,
      // "profile_update" is outside the SourceDocumentType union but the
      // helper only uses it for downstream conflict tagging — cast is safe.
      sourceDocumentType: "profile_update" as unknown as import("@/lib/client-import-schema").SourceDocumentType,
      onError: async (action, message) => {
        try {
          await sb.from("import_audit").insert({
            org_id: orgId,
            item: `[profile-update] ${message}`,
            traces_to: "admin_review",
            actor: context.userId,
            action,
          });
        } catch { /* never let audit failure break a save */ }
      },
    });

    return {
      ok: true,
      autofilled: summary.autofilled,
      suggested: summary.suggested,
      customCreated: summary.customCreated,
      appliedCount: fields.length,
    };
  });

// ── Resolve a merge flag (keep both / merge / replace) ───────────────────
const ResolveFlag = z.object({
  flagId: z.string().uuid(),
  action: z.enum(["keep_both", "merge_into_existing", "replace"]),
});
export const resolveMergeFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ResolveFlag.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: flag } = await sb
      .from("import_merge_flags")
      .select("id, client_id, field, incoming_value, kind")
      .eq("id", data.flagId)
      .maybeSingle();
    if (!flag) throw new Error("Flag not found");
    await requireAdminForClient(sb, context.userId as string, flag.client_id);

    if (data.action === "replace" && flag.field && flag.incoming_value) {
      // Only safe to auto-apply on plain text scalar columns on `clients`. We
      // try the update; if it fails (column doesn't exist / wrong shape) we
      // still mark the flag resolved so it stops blocking the queue, and the
      // admin can manually fix the field on the profile page.
      try {
        await sb
          .from("clients")
          .update({ [flag.field]: flag.incoming_value })
          .eq("id", flag.client_id);
      } catch { /* best-effort */ }
    }
    // keep_both / merge_into_existing don't need a column write; they're
    // admin acknowledgements that the existing value stays as-is.

    const { error } = await sb
      .from("import_merge_flags")
      .update({
        resolved_action: data.action,
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      })
      .eq("id", data.flagId);
    if (error) throw error;
    return { ok: true };
  });

// ── Override a validation issue ─────────────────────────────────────────
const OverrideIssue = z.object({
  subjectId: z.string().uuid(),
  issueKey: z.string().min(1).max(120),
  overridden: z.boolean(),
});
export const overrideValidationIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OverrideIssue.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: subj } = await sb
      .from("import_subjects")
      .select("id, org_id, import_job_id, validation_overrides")
      .eq("id", data.subjectId)
      .maybeSingle();
    if (!subj) throw new Error("Subject not found");
    const next = { ...(subj.validation_overrides as Record<string, boolean> ?? {}) };
    if (data.overridden) next[data.issueKey] = true;
    else delete next[data.issueKey];
    const { error } = await sb
      .from("import_subjects")
      .update({ validation_overrides: next })
      .eq("id", data.subjectId);
    if (error) throw error;
    await sb.from("import_audit").insert({
      import_job_id: subj.import_job_id,
      org_id: subj.org_id,
      subject_id: data.subjectId,
      item: `Validation issue ${data.issueKey} ${data.overridden ? "overridden" : "un-overridden"} by admin`,
      traces_to: "admin_override",
      actor: context.userId,
      action: data.overridden ? "validation_override" : "validation_override_removed",
    });
    return { ok: true, overrides: next };
  });

// ── SOW supplemental: level of need, secondary emergency contact ────────
export const setLevelOfNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      value: z.string().max(120).nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { error } = await sb
      .from("clients")
      .update({ level_of_need: data.value?.trim() || null })
      .eq("id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

export const setEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      slot: z.enum(["primary", "secondary"]),
      name: z.string().max(120).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      instructions: z.string().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const cols = data.slot === "primary"
      ? { name: "emergency_contact_name", phone: "emergency_contact_phone", instr: "emergency_contact_instructions" }
      : { name: "emergency_contact_2_name", phone: "emergency_contact_2_phone", instr: "emergency_contact_2_instructions" };
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch[cols.name] = data.name?.trim() || null;
    if (data.phone !== undefined) patch[cols.phone] = data.phone?.trim() || null;
    if (data.instructions !== undefined) patch[cols.instr] = data.instructions?.trim() || null;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await sb.from("clients").update(patch).eq("id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

// ── Grievance policy acknowledgment (SOW §1.10(11)) ─────────────────────
export const setGrievanceAcknowledgment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      acknowledged: z.boolean(),
      signedDate: z.string().max(40).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const patch: Record<string, unknown> = {
      grievance_acknowledged: data.acknowledged,
      grievance_signed_date: data.acknowledged
        ? (data.signedDate || new Date().toISOString().slice(0, 10))
        : null,
    };
    const { error } = await sb.from("clients").update(patch).eq("id", data.clientId);
    if (error) throw error;
    return { ok: true };
  });

// ── HRC chain (rights restrictions, SOW §1.20) ──────────────────────────
// Uses the existing hrc_reviews table — no new columns on clients.
export const listHrcReviewsForClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: rows, error } = await sb
      .from("hrc_reviews")
      .select("id, restriction_summary, status, created_at")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { reviews: rows ?? [] };
  });

export const createHrcReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      restriction_summary: z.string().min(1).max(2000),
      status: z.string().min(1).max(40).default("pending"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const orgId = await requireAdminForClient(sb, context.userId as string, data.clientId);
    const { data: ins, error } = await sb
      .from("hrc_reviews")
      .insert({
        organization_id: orgId,
        client_id: data.clientId,
        restriction_summary: data.restriction_summary,
        status: data.status,
        created_by: context.userId,
      })
      .select("id, status, restriction_summary")
      .single();
    if (error) throw error;
    return { ok: true, review: ins };
  });

// ── Signed-URL fetch for a client_documents row (profile downloads) ─────
export const signClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      documentId: z.string().uuid(),
      expiresIn: z.number().int().positive().max(3600).default(300),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: doc } = await sb
      .from("client_documents")
      .select("id, client_id, storage_path, file_url, file_name")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc) throw new Error("Document not found");
    await requireAdminForClient(sb, context.userId as string, doc.client_id);
    const path = (doc.storage_path as string) || (doc.file_url as string);
    if (!path) throw new Error("Document has no storage path");
    const { data: signed, error } = await sb.storage
      .from("client-documents")
      .createSignedUrl(path, data.expiresIn);
    if (error) throw error;
    return { url: signed.signedUrl as string, fileName: doc.file_name as string };
  });
