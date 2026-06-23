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
    "dnr", "polst", "palliative", "hospice", "other",
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
