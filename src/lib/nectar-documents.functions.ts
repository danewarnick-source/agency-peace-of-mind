import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

// =============================================================
// NECTAR Universal Document Store — server functions
// All other features (billing rate auto-fill, audit auto-pull,
// monthly billing support docs, etc.) read from this layer.
// =============================================================

const OwnerKind = z.enum(["client", "staff", "company", "state", "other"]);

const DOC_TYPES = [
  "pcsp",
  "1056_budget",
  "sow",
  "referral",
  "intake",
  "assessment",
  "certification",
  "training",
  "contract",
  "evv_report",
  "timesheet",
  "incident_report",
  "billing_record",
  "other",
] as const;

// ---------- PDF / text extraction ----------

async function extractPdfText(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function decodeBase64Text(base64: string): string {
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

// ---------- AI parsing via Lovable AI Gateway ----------

const FieldOut = z.object({
  field_key: z.string().min(1).max(80),
  field_group: z.string().max(80).optional().nullable(),
  value_text: z.string().max(2000).optional().nullable(),
  value_number: z.number().optional().nullable(),
  value_date: z.string().max(40).optional().nullable(),
  value_bool: z.boolean().optional().nullable(),
  value_array: z.array(z.string().max(500)).max(50).optional().nullable(),
  value_json: z.any().optional().nullable(),
  source_locator: z.string().max(200).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});

const ParseOut = z.object({
  document_type: z.string().max(40).optional().nullable(),
  fiscal_year: z.string().max(20).optional().nullable(),
  effective_start: z.string().max(40).optional().nullable(),
  effective_end: z.string().max(40).optional().nullable(),
  medicaid_id: z.string().max(50).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  fields: z.array(FieldOut).max(300).default([]),
});

const SYSTEM_PROMPT = `You are NECTAR, an extraction engine for a Utah DSPD provider compliance platform (HIVE).
You receive raw text from a document (PCSP, 1056 budget, SOW, referral, intake, assessment, certification, contract, etc.).

Extract structured fields and return STRICT JSON only. Use these conventions:

document_type: one of pcsp | 1056_budget | sow | referral | intake | assessment | certification | training | contract | evv_report | timesheet | incident_report | billing_record | other
fiscal_year: e.g. "FY26"
effective_start / effective_end: ISO yyyy-mm-dd
medicaid_id: digits only if present

Each extracted field has: field_key, field_group, optional value_text / value_number / value_date / value_bool / value_array / value_json, source_locator, confidence (0..1).
- Dates in value_date as ISO yyyy-mm-dd.
- Booleans in value_bool.
- Short string lists (allergies, swallowing alerts) in value_array.
- Structured rows (a billing-code authorization row) in value_json.

Common field_key values you should extract when present (use field_group to bucket related fields):
  Person (group "person"): first_name, last_name, dob (value_date), medicaid_id, phone, plan_year
  Address (group "address"): physical_address  -- the client's service/home street address
  Emergency contact (group "emergency_contact"): emergency_contact_name, emergency_contact_phone
  Guardian (group "guardian"): is_own_guardian (value_bool), guardian_name, guardian_phone,
    guardian_relationship, guardian_email, guardian_address
  Goals (group "goals"): pcsp_goal  -- emit ONE field per distinct goal/objective in value_text
  Health (group "health"): allergies (value_array), dysphagia (value_bool),
    swallowing_alerts (value_array), self_admin_med_support (value_bool),
    clinical_alert (value_text — any high-priority safety/clinical notice, e.g. choking risk),
    special_directions (value_text — care/access notes)
  Billing (group "billing_code"): emit ONE field per authorized service code with
    field_key = "billing_code_row" and value_json = { service_code, rate, max_units, unit_type,
    weekly_cap_units, plan_start, plan_end, financial_eligibility }.
  SOW (group "sow_clause"): clause_number, required_document, obligation, deadline
  Certification (group "cert"): cert_name, issued_at, expires_at, issuing_body

For each field include source_locator (e.g. "page 3", "§4.2", "row 12 of budget table") and a confidence 0..1.`;

async function callLovableAI(documentText: string, hint?: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await gatewayFetch({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${hint ? `HINT: ${hint}\n\n` : ""}DOCUMENT TEXT:\n\n${documentText.slice(0, 60000)}`,
        },
      ],
      response_format: { type: "json_object" },
    });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  const result = ParseOut.safeParse(parsed);
  return result.success ? result.data : { fields: [] };
}

// Client autofill logic lives in src/lib/client-import-schema.ts so both
// per-client upload and Smart Import call the same path.
import { applyExtractedFieldsToClient } from "@/lib/client-import-schema";



// =============================================================
// 1. INGEST — upload + parse
// =============================================================

export const ingestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ownerKind: OwnerKind,
        clientId: z.string().uuid().optional().nullable(),
        staffId: z.string().uuid().optional().nullable(),
        documentType: z.enum(DOC_TYPES).default("other"),
        category: z.string().max(40).optional().nullable(),
        title: z.string().min(1).max(200),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(120).optional().nullable(),
        fileBase64: z.string().min(10),
        fiscalYear: z.string().max(20).optional().nullable(),
        effectiveStart: z.string().max(40).optional().nullable(),
        effectiveEnd: z.string().max(40).optional().nullable(),
        medicaidId: z.string().max(50).optional().nullable(),
        tags: z.array(z.string().max(40)).max(20).default([]),
        externalIds: z.record(z.string(), z.string().max(120)).optional(),
        parentDocumentId: z.string().uuid().optional().nullable(),
        autoParse: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");


    // 1. Upload to storage
    const binary = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    const objectPath = `${data.organizationId}/${crypto.randomUUID()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const upload = await supabase.storage
      .from("nectar-documents")
      .upload(objectPath, binary, {
        contentType: data.mimeType ?? "application/octet-stream",
        upsert: false,
      });
    if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

    // 2. Version chain: if parentDocumentId provided, increment version and mark old non-current
    let version = 1;
    if (data.parentDocumentId) {
      const { data: parent } = await supabase
        .from("nectar_documents")
        .select("version")
        .eq("id", data.parentDocumentId)
        .maybeSingle();
      version = ((parent?.version as number) ?? 1) + 1;
      await supabase
        .from("nectar_documents")
        .update({ is_current: false })
        .eq("id", data.parentDocumentId);
    }

    // 3. Fetch uploader display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const { data: doc, error: insertErr } = await supabase
      .from("nectar_documents")
      .insert({
        organization_id: data.organizationId,
        owner_kind: data.ownerKind,
        client_id: data.clientId ?? null,
        staff_id: data.staffId ?? null,
        document_type: data.documentType,
        category: data.category ?? null,
        title: data.title,
        parent_document_id: data.parentDocumentId ?? null,
        version,
        is_current: true,
        effective_start: data.effectiveStart ?? null,
        effective_end: data.effectiveEnd ?? null,
        fiscal_year: data.fiscalYear ?? null,
        medicaid_id: data.medicaidId ?? null,
        external_ids: data.externalIds ?? {},
        tags: data.tags,
        storage_path: objectPath,
        file_name: data.fileName,
        mime_type: data.mimeType ?? null,
        file_size_bytes: binary.byteLength,
        source: "upload",
        parse_status: data.autoParse ? "parsing" : "skipped",
        uploaded_by: userId,
        uploaded_by_name: (profile?.full_name as string) ?? (profile?.email as string) ?? null,
      })
      .select("*")
      .single();
    if (insertErr || !doc) throw new Error(insertErr?.message ?? "Insert failed");

    if (!data.autoParse) return { document: doc, extracted: [] as Array<{ field_key: string }> };

    // 4. Parse
    try {
      let text = "";
      const mime = (data.mimeType ?? "").toLowerCase();
      if (mime.includes("pdf") || data.fileName.toLowerCase().endsWith(".pdf")) {
        text = await extractPdfText(data.fileBase64);
      } else if (mime.startsWith("text/") || /\.(txt|csv|md|json|html?)$/i.test(data.fileName)) {
        text = decodeBase64Text(data.fileBase64);
      } else {
        // For images / scans / unsupported formats, store the document but skip parse
        await supabase
          .from("nectar_documents")
          .update({ parse_status: "skipped", parse_error: "OCR not yet enabled for this format" })
          .eq("id", doc.id);
        return { document: doc, extracted: [] as Array<{ field_key: string }> };
      }

      const ai = await callLovableAI(text, `documentType=${data.documentType}`);
      const rows = (ai.fields ?? []).map((f) => {
        // Fold value_bool / value_array into value_json so they persist (the
        // table has no boolean/array columns).
        let value_json = f.value_json ?? null;
        if (f.value_bool !== undefined && f.value_bool !== null) {
          value_json = { ...(value_json ?? {}), bool: f.value_bool };
        }
        if (f.value_array && f.value_array.length) {
          value_json = { ...(value_json ?? {}), array: f.value_array };
        }
        return {
          organization_id: data.organizationId,
          document_id: doc.id,
          field_key: f.field_key,
          field_group: f.field_group ?? null,
          value_text: f.value_text ?? null,
          value_number: f.value_number ?? null,
          value_date: f.value_date ?? null,
          value_json,
          source_locator: f.source_locator ?? null,
          confidence: f.confidence ?? null,
          status: "proposed" as const,
        };
      });
      if (rows.length) {
        await supabase.from("nectar_extracted_fields").insert(rows);
      }

      // ─── Autofill the client record from extracted fields ───────────
      let autofillResult: { autofilled: string[]; suggested: string[] } = {
        autofilled: [],
        suggested: [],
      };
      let autofillError: string | null = null;
      const effectiveDocType = (ai.document_type ?? data.documentType ?? "").toLowerCase();
      const AUTOFILL_TYPES = new Set(["pcsp", "1056_budget", "intake", "assessment"]);
      if (data.clientId && AUTOFILL_TYPES.has(effectiveDocType)) {
        try {
          autofillResult = await applyClientAutofill({
            supabase,
            organizationId: data.organizationId,
            clientId: data.clientId,
            fields: ai.fields ?? [],
          });
        } catch (err) {
          autofillError = (err as Error).message;
        }
      }

      await supabase
        .from("nectar_documents")
        .update({
          parse_status: "parsed",
          parsed_at: new Date().toISOString(),
          raw_text: text.slice(0, 50000),
          parse_error: autofillError ? `autofill: ${autofillError}` : null,
          // Backfill any fields the parser identified more confidently than the user input
          fiscal_year: data.fiscalYear ?? ai.fiscal_year ?? null,
          medicaid_id: data.medicaidId ?? ai.medicaid_id ?? null,
        })
        .eq("id", doc.id);

      return {
        document: doc,
        extracted: rows,
        autofilled: autofillResult.autofilled,
        suggested: autofillResult.suggested,
      };
    } catch (err) {
      await supabase
        .from("nectar_documents")
        .update({ parse_status: "failed", parse_error: (err as Error).message })
        .eq("id", doc.id);
      return { document: doc, extracted: [], parseError: (err as Error).message };
    }
  });

// =============================================================
// 2. RETRIEVAL API
// =============================================================

export const queryDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        ownerKind: OwnerKind.optional(),
        clientId: z.string().uuid().optional().nullable(),
        staffId: z.string().uuid().optional().nullable(),
        documentType: z.string().max(40).optional(),
        fiscalYear: z.string().max(20).optional(),
        tag: z.string().max(40).optional(),
        search: z.string().max(120).optional(),
        currentOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("nectar_documents")
      .select(
        "id, owner_kind, client_id, staff_id, document_type, category, title, version, is_current, effective_start, effective_end, fiscal_year, medicaid_id, tags, file_name, mime_type, parse_status, uploaded_by_name, uploaded_at:created_at, created_at",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.currentOnly) q = q.eq("is_current", true);
    if (data.ownerKind) q = q.eq("owner_kind", data.ownerKind);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    if (data.documentType) q = q.eq("document_type", data.documentType);
    if (data.fiscalYear) q = q.eq("fiscal_year", data.fiscalYear);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { documents: rows ?? [] };
  });

export const getDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("nectar_documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Not found");

    const { data: fields } = await supabase
      .from("nectar_extracted_fields")
      .select("*")
      .eq("document_id", data.documentId)
      .order("field_group", { ascending: true, nullsFirst: true })
      .order("field_key", { ascending: true });

    // Version history (walk parent chain — simple: same title or shared parent)
    const rootId = (doc.parent_document_id as string | null) ?? doc.id;
    const { data: versions } = await supabase
      .from("nectar_documents")
      .select("id, version, is_current, created_at, uploaded_by_name, file_name")
      .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`)
      .order("version", { ascending: false });

    // Signed url
    let signedUrl: string | null = null;
    const signed = await supabase.storage
      .from(doc.storage_bucket as string)
      .createSignedUrl(doc.storage_path as string, 60 * 30);
    signedUrl = signed.data?.signedUrl ?? null;

    return { document: doc, fields: fields ?? [], versions: versions ?? [], signedUrl };
  });

// Targeted retrieval: structured fields by document + field_key — drives
// downstream features like rate auto-fill.
export const getExtractedFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        clientId: z.string().uuid().optional().nullable(),
        documentType: z.string().max(40).optional(),
        fieldGroup: z.string().max(80).optional(),
        fieldKey: z.string().max(80).optional(),
        confirmedOnly: z.boolean().default(false),
        currentOnly: z.boolean().default(true),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let docQ = supabase
      .from("nectar_documents")
      .select("id")
      .eq("organization_id", data.organizationId);
    if (data.clientId) docQ = docQ.eq("client_id", data.clientId);
    if (data.documentType) docQ = docQ.eq("document_type", data.documentType);
    if (data.currentOnly) docQ = docQ.eq("is_current", true);
    const { data: docs } = await docQ;
    const ids = (docs ?? []).map((d) => d.id as string);
    if (!ids.length) return { fields: [] };

    let fQ = supabase
      .from("nectar_extracted_fields")
      .select("*")
      .in("document_id", ids)
      .limit(data.limit);
    if (data.fieldGroup) fQ = fQ.eq("field_group", data.fieldGroup);
    if (data.fieldKey) fQ = fQ.eq("field_key", data.fieldKey);
    if (data.confirmedOnly) fQ = fQ.eq("status", "confirmed");
    const { data: rows, error } = await fQ;
    if (error) throw new Error(error.message);
    return { fields: rows ?? [] };
  });

// =============================================================
// 3. SOURCE-OF-TRUTH — confirm / override extracted field
// =============================================================

export const reviewExtractedField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fieldId: z.string().uuid(),
        action: z.enum(["confirm", "override", "reject"]),
        overrideValue: z
          .object({
            value_text: z.string().max(2000).optional().nullable(),
            value_number: z.number().optional().nullable(),
            value_date: z.string().max(40).optional().nullable(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Resolve org via the field → document; verify caller is a manager+ there.
    const { data: fieldRow } = await supabase
      .from("nectar_extracted_fields")
      .select("organization_id")
      .eq("id", data.fieldId)
      .maybeSingle();
    if (!fieldRow?.organization_id) throw new Error("Extracted field not found");
    await requireOrgMembership(supabase, userId, fieldRow.organization_id as string, "manager");
    const update: Record<string, unknown> = {
      status: data.action === "confirm" ? "confirmed" : data.action === "override" ? "overridden" : "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.action === "override" && data.overrideValue) {
      update.override_value = data.overrideValue;
      if (data.overrideValue.value_text !== undefined) update.value_text = data.overrideValue.value_text;
      if (data.overrideValue.value_number !== undefined) update.value_number = data.overrideValue.value_number;
      if (data.overrideValue.value_date !== undefined) update.value_date = data.overrideValue.value_date;
    }
    const { error } = await supabase
      .from("nectar_extracted_fields")
      .update(update as never)
      .eq("id", data.fieldId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc } = await supabase
      .from("nectar_documents")
      .select("storage_path, storage_bucket, organization_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc?.organization_id) throw new Error("Document not found");
    await requireOrgMembership(supabase, userId, doc.organization_id as string, "manager");
    if (doc?.storage_path) {
      await supabase.storage.from(doc.storage_bucket as string).remove([doc.storage_path as string]);
    }
    const { error } = await supabase.from("nectar_documents").delete().eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
