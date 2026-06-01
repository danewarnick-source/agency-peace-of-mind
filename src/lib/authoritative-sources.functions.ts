import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =============================================================
// Foundation B — Authoritative sources, derived requirements,
// and the immutable attestation log.
// HIVE organizes; the company's uploaded documents are the source of truth.
// =============================================================

const AUTH_KINDS = [
  "state_sow",
  "provider_contract",
  "dspd_requirement",
  "dhs_requirement",
  "public_record",
  "other",
] as const;

// ---------- Authoritative sources ----------

export const listAuthoritativeSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("nectar_documents")
      .select(
        "id, title, document_type, authoritative_kind, fiscal_year, effective_start, effective_end, file_name, uploaded_by_name, created_at, parse_status, is_current, version",
      )
      .eq("organization_id", data.organizationId)
      .eq("is_authoritative_source", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sources: rows ?? [] };
  });

export const markAsAuthoritativeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        documentId: z.string().uuid(),
        authoritativeKind: z.enum(AUTH_KINDS),
        isAuthoritative: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("nectar_documents")
      .update({
        is_authoritative_source: data.isAuthoritative,
        authoritative_kind: data.isAuthoritative ? data.authoritativeKind : null,
      })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Derived requirements (NECTAR-organized checklist) ----------

export const listRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        origin: z.enum(["document", "suggestion", "manual"]).optional(),
        category: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("nectar_requirements")
      .select(
        "id, source_document_id, origin, requirement_key, title, description, category, source_citation, applies_to, verified, verified_by, verified_at, created_at, metadata",
      )
      .eq("organization_id", data.organizationId)
      .order("origin", { ascending: true })
      .order("category", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true });
    if (data.origin) q = q.eq("origin", data.origin);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Lightweight source-doc lookup for citation rendering
    const sourceIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.source_document_id as string | null)
          .filter((x): x is string => !!x),
      ),
    );
    const sourcesById: Record<string, { id: string; title: string; authoritative_kind: string | null }> = {};
    if (sourceIds.length) {
      const { data: srcs } = await supabase
        .from("nectar_documents")
        .select("id, title, authoritative_kind")
        .in("id", sourceIds);
      for (const s of srcs ?? [])
        sourcesById[s.id as string] = {
          id: s.id as string,
          title: s.title as string,
          authoritative_kind: (s.authoritative_kind as string | null) ?? null,
        };
    }

    return { requirements: rows ?? [], sourcesById };
  });

export const upsertRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        organizationId: z.string().uuid(),
        sourceDocumentId: z.string().uuid().optional().nullable(),
        origin: z.enum(["document", "suggestion", "manual"]).default("manual"),
        requirementKey: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional().nullable(),
        category: z.string().max(40).optional().nullable(),
        sourceCitation: z.string().max(200).optional().nullable(),
        appliesTo: z.string().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const payload = {
      organization_id: data.organizationId,
      source_document_id: data.sourceDocumentId ?? null,
      origin: data.origin,
      requirement_key: data.requirementKey,
      title: data.title,
      description: data.description ?? null,
      category: data.category ?? null,
      source_citation: data.sourceCitation ?? null,
      applies_to: data.appliesTo ?? null,
    };
    if (data.id) {
      const { error } = await supabase
        .from("nectar_requirements")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("nectar_requirements")
      .insert(payload)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string };
  });

export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("nectar_requirements")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        verified: z.boolean(),
        attestStatement: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: getErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id, title")
      .eq("id", data.id)
      .single();
    if (getErr || !req) throw new Error(getErr?.message ?? "Requirement not found");

    const { error } = await supabase
      .from("nectar_requirements")
      .update({
        verified: data.verified,
        verified_by: data.verified ? userId : null,
        verified_at: data.verified ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.verified && data.attestStatement) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      await supabase.from("nectar_attestations").insert({
        organization_id: req.organization_id,
        user_id: userId,
        user_display_name:
          (profile?.full_name as string) ?? (profile?.email as string) ?? null,
        scope: "requirement_verify",
        scope_ref_id: req.id,
        scope_ref_type: "nectar_requirement",
        statement: data.attestStatement,
        context: { requirement_title: req.title },
      });
    }
    return { ok: true };
  });

// ---------- Generate suggested requirements from an authoritative source ----------
// NECTAR proposes — admin verifies. Source-citation always carried.

export const generateRequirementsFromSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        documentId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error: dErr } = await supabase
      .from("nectar_documents")
      .select("id, organization_id, title, raw_text, authoritative_kind, is_authoritative_source")
      .eq("id", data.documentId)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Document not found");
    if (!doc.is_authoritative_source)
      throw new Error("Document is not marked as an authoritative source.");

    // Pull SOW-style extracted fields (group "sow_clause") as the natural seed
    const { data: fields } = await supabase
      .from("nectar_extracted_fields")
      .select("field_key, field_group, value_text, source_locator")
      .eq("document_id", data.documentId);

    const sowFields = (fields ?? []).filter(
      (f) => (f.field_group as string | null) === "sow_clause",
    );

    let inserted = 0;
    for (const f of sowFields) {
      const title =
        (f.value_text as string | null)?.slice(0, 180) ??
        `Requirement: ${f.field_key}`;
      const citation = (f.source_locator as string | null) ?? null;
      const key = `${(doc.authoritative_kind as string) ?? "src"}:${f.field_key as string}:${(f.source_locator as string | null) ?? ""}`.slice(
        0,
        120,
      );
      const { error } = await supabase.from("nectar_requirements").insert({
        organization_id: doc.organization_id,
        source_document_id: doc.id,
        origin: "document",
        requirement_key: key,
        title,
        description: (f.value_text as string | null) ?? null,
        category:
          (f.field_key as string) === "required_document" ? "audit_doc" : "obligation",
        source_citation: citation
          ? `${(doc.title as string) ?? "Source"} — ${citation}`
          : (doc.title as string) ?? null,
        applies_to: "company",
      });
      if (!error) inserted += 1;
    }

    return { inserted, totalFields: sowFields.length };
  });

// ---------- Attestation log ----------

export const recordAttestation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        scope: z.enum([
          "document_upload",
          "requirement_verify",
          "audit_packet",
          "form_submission",
          "billing_520",
          "generic",
        ]),
        scopeRefId: z.string().uuid().optional().nullable(),
        scopeRefType: z.string().max(60).optional().nullable(),
        statement: z.string().min(10).max(4000),
        contextJson: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const { data: row, error } = await supabase
      .from("nectar_attestations")
      .insert({
        organization_id: data.organizationId,
        user_id: userId,
        user_display_name:
          (profile?.full_name as string) ?? (profile?.email as string) ?? null,
        scope: data.scope,
        scope_ref_id: data.scopeRefId ?? null,
        scope_ref_type: data.scopeRefType ?? null,
        statement: data.statement,
        context: data.contextJson ?? {},
      })
      .select("id, attested_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string, attestedAt: row.attested_at as string };
  });

export const listAttestations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        scope: z.string().max(60).optional(),
        scopeRefId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("nectar_attestations")
      .select(
        "id, scope, scope_ref_id, scope_ref_type, statement, user_id, user_display_name, attested_at, context",
      )
      .eq("organization_id", data.organizationId)
      .order("attested_at", { ascending: false })
      .limit(data.limit);
    if (data.scope) q = q.eq("scope", data.scope);
    if (data.scopeRefId) q = q.eq("scope_ref_id", data.scopeRefId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { attestations: rows ?? [] };
  });

export const REDUCED_LIABILITY_NOTICE = `The documents, checklists, and data shown here are generated from materials you uploaded (including your contracts and State Scope of Work) and from information entered by your staff. HIVE/NECTAR organizes and surfaces this information but does not independently verify its accuracy or guarantee compliance with State requirements. You are strongly encouraged to review all forms and documents for accuracy. By proceeding, you confirm you have reviewed this information and accept responsibility for its accuracy and for your submissions to the State.`;
