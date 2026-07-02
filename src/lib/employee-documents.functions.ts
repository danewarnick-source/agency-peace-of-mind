/**
 * Employee documents — per-employee uploads (applications, onboarding forms,
 * I-9/W-4, resume, background check, driver's license, direct-deposit form,
 * offer letter, etc.) that NECTAR can read and use to autofill the profile.
 *
 * Mirrors the client-side document pattern:
 *  - private "employee-docs" storage bucket
 *  - employee_documents table (org-scoped, admins/managers write)
 *  - per-document AI extraction that only writes to empty profile columns
 *    (never clobbers a value an admin already entered).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { aiExtractEmployeeFieldsFromText } from "@/lib/smart-import.functions";

const BUCKET = "employee-docs";

type Doc = {
  id: string;
  organization_id: string;
  staff_id: string;
  kind: string;
  title: string | null;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  nectar_status: string;
  nectar_last_run_at: string | null;
  nectar_applied_fields: Record<string, unknown> | null;
  nectar_error: string | null;
};

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
export const listEmployeeDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("employee_documents")
      .select("id, organization_id, staff_id, kind, title, file_path, file_name, mime_type, size_bytes, uploaded_by, uploaded_at, nectar_status, nectar_last_run_at, nectar_applied_fields, nectar_error")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Doc[];
  });

// ---------------------------------------------------------------------------
// CREATE SIGNED UPLOAD URL + PRE-INSERT ROW
// ---------------------------------------------------------------------------
export const createEmployeeDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      staff_id: z.string().uuid(),
      kind: z.string().min(1).max(64),
      title: z.string().max(255).optional().nullable(),
      file_name: z.string().min(1).max(255),
      mime_type: z.string().max(255).optional().nullable(),
      size_bytes: z.number().int().min(0).max(50 * 1024 * 1024).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const safe = data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    // First path segment must be org id so the storage RLS check passes.
    const objectPath = `${data.organization_id}/${data.staff_id}/${crypto.randomUUID()}-${safe}`;

    const { data: signed, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectPath);
    if (signErr) throw new Error(signErr.message);

    const { data: doc, error: insErr } = await sb
      .from("employee_documents")
      .insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        kind: data.kind,
        title: data.title ?? null,
        file_path: objectPath,
        file_name: data.file_name,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return {
      employee_document_id: doc.id as string,
      object_path: objectPath,
      upload: {
        signed_url: signed.signedUrl as string,
        token: signed.token as string,
        path: signed.path as string,
      },
    };
  });

// ---------------------------------------------------------------------------
// GET SIGNED READ URL
// ---------------------------------------------------------------------------
export const getEmployeeDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      employee_document_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: doc, error } = await sb
      .from("employee_documents")
      .select("id, organization_id, file_path, file_name")
      .eq("id", data.employee_document_id)
      .single();
    if (error || !doc) throw new Error("Document not found");
    if (doc.organization_id !== data.organization_id) throw new Error("Forbidden");
    const { data: signed, error: sErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 120);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl as string, file_name: doc.file_name as string | null };
  });

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export const deleteEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      employee_document_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: doc, error } = await sb
      .from("employee_documents")
      .select("id, organization_id, file_path")
      .eq("id", data.employee_document_id)
      .single();
    if (error || !doc) throw new Error("Document not found");
    if (doc.organization_id !== data.organization_id) throw new Error("Forbidden");
    await sb.storage.from(BUCKET).remove([doc.file_path]);
    const { error: delErr } = await sb.from("employee_documents").delete().eq("id", doc.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// EXTRACT & AUTOFILL — NECTAR reads the document and populates ONLY empty
// profile columns. Non-empty columns are returned as "suggestions" the admin
// can accept explicitly from the tracked-fields UI (out of scope of this MVP;
// the raw suggestions are exposed on the document row).
// ---------------------------------------------------------------------------

// Map extractor keys to `profiles` columns. Only lists safe, non-PII-gated
// scalar fields. SSN, bank account #s, DOB and similar are intentionally
// excluded — they belong in PII-gated storage.
const PROFILE_FIELD_MAP: Record<string, string> = {
  full_name: "full_name",
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  position: "position",
  hire_date: "hire_date",
  department: "department",
  employee_id: "employee_id",
};

async function fetchFileBuffer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  filePath: string,
): Promise<{ buf: Buffer; mime: string | null }> {
  const { data, error } = await sb.storage.from(BUCKET).download(filePath);
  if (error) throw new Error(`Download failed: ${error.message}`);
  const ab = await (data as Blob).arrayBuffer();
  return { buf: Buffer.from(ab), mime: (data as Blob).type || null };
}

export const extractEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      employee_document_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: doc, error: docErr } = await sb
      .from("employee_documents")
      .select("id, organization_id, staff_id, file_path, file_name, mime_type")
      .eq("id", data.employee_document_id)
      .single();
    if (docErr || !doc) throw new Error("Document not found");
    if (doc.organization_id !== data.organization_id) throw new Error("Forbidden");

    // 1) Download file bytes and pull text.
    const { extractTextFromUpload } = await import("@/lib/document-text.server");
    const { buf } = await fetchFileBuffer(sb, doc.file_path);
    const text = await extractTextFromUpload(buf, doc.file_name ?? "upload", doc.mime_type);
    if (!text || text.trim().length < 20) {
      await sb.from("employee_documents").update({
        nectar_status: "unreadable",
        nectar_error: "Document had no extractable text (image-only PDF or unsupported format).",
        nectar_last_run_at: new Date().toISOString(),
      }).eq("id", doc.id);
      throw new Error("NECTAR could not read this document (no extractable text).");
    }

    // 2) Ask the model for structured fields.
    let extracted: Awaited<ReturnType<typeof aiExtractEmployeeFieldsFromText>>;
    try {
      extracted = await aiExtractEmployeeFieldsFromText(text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      await sb.from("employee_documents").update({
        nectar_status: "failed",
        nectar_error: msg.slice(0, 500),
        nectar_last_run_at: new Date().toISOString(),
      }).eq("id", doc.id);
      throw new Error(msg);
    }

    // 3) Load current profile and only autofill empty scalar fields.
    const { data: profile } = await sb
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, phone, position, positions, hire_date, department, employee_id")
      .eq("id", doc.staff_id)
      .maybeSingle();

    const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

    const patch: Record<string, unknown> = {};
    const applied: Array<{ field: string; value: string; confidence: number }> = [];
    const suggested: Array<{ field: string; value: string; confidence: number; existing: string | null }> = [];

    for (const f of extracted.fields ?? []) {
      const col = PROFILE_FIELD_MAP[f.target_field];
      if (!col) continue;
      const value = String(f.value ?? "").trim();
      if (!value) continue;
      const current = profile ? (profile as Record<string, unknown>)[col] : null;
      if (isEmpty(current)) {
        patch[col] = value;
        applied.push({ field: col, value, confidence: f.confidence });
      } else if (String(current).trim().toLowerCase() !== value.toLowerCase()) {
        suggested.push({
          field: col,
          value,
          confidence: f.confidence,
          existing: current == null ? null : String(current),
        });
      }
    }

    // Convenience: if position was set and profile has no positions[] yet,
    // seed the array from the scalar so the profile page badge picks it up.
    if (patch.position && profile && (!Array.isArray(profile.positions) || profile.positions.length === 0)) {
      patch.positions = [patch.position];
    }

    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await sb.from("profiles").update(patch).eq("id", doc.staff_id);
      if (upErr) throw new Error(`Autofill failed: ${upErr.message}`);
    }

    const nectarSummary = {
      applied,
      suggested,
      display_name: extracted.display_name,
      unfiled: extracted.unfiled ?? [],
      extracted_at: new Date().toISOString(),
    };
    await sb.from("employee_documents").update({
      nectar_status: applied.length > 0 || suggested.length > 0 ? "extracted" : "no_fields",
      nectar_error: null,
      nectar_last_run_at: nectarSummary.extracted_at,
      nectar_applied_fields: nectarSummary,
    }).eq("id", doc.id);

    return {
      applied_count: applied.length,
      suggested_count: suggested.length,
      applied,
      suggested,
    };
  });
