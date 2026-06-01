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

// ---------- Web-page authoritative sources ----------
// NECTAR reads content that is directly rendered on the page itself.
// Files linked FROM the page (PDFs, attachments) are NOT followed —
// the user must download those and upload them separately.

function stripHtmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : null;
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ");
  cleaned = cleaned.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text: cleaned };
}

export const ingestWebSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        url: z.string().url().max(2000),
        title: z.string().min(1).max(200),
        authoritativeKind: z.enum(AUTH_KINDS),
        fiscalYear: z.string().max(20).optional().nullable(),
        effectiveStart: z.string().max(40).optional().nullable(),
        effectiveEnd: z.string().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const parsedUrl = new URL(data.url);
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      throw new Error("Only http:// and https:// URLs are supported.");
    }

    let html = "";
    try {
      const res = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; HIVE-NECTAR/1.0; +https://hivecompliance.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`Page returned HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("html") && !contentType.includes("text")) {
        throw new Error(
          `URL is not a readable web page (content-type: ${contentType}). If it's a PDF or document download, upload the file directly instead.`,
        );
      }
      html = await res.text();
    } catch (err) {
      throw new Error(
        `Couldn't fetch ${parsedUrl.host}: ${(err as Error).message}`,
      );
    }

    const { title: pageTitle, text } = stripHtmlToText(html);
    const letterCount = (text.match(/[a-zA-Z]/g) ?? []).length;
    if (text.length < 200 || letterCount < 80) {
      throw new Error(
        "NECTAR couldn't read meaningful text from that page. It may be JavaScript-rendered or behind a login. Try a direct, public, text-based URL — or upload the document file.",
      );
    }

    const capturedAt = new Date().toISOString();
    const snapshotBody = `Source URL: ${parsedUrl.toString()}\nCaptured: ${capturedAt}\nPage title: ${pageTitle ?? "—"}\n\n----- BEGIN CAPTURED TEXT -----\n\n${text}`;
    const snapshotBytes = new TextEncoder().encode(snapshotBody);
    const safeHost = parsedUrl.host.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${data.organizationId}/web-${safeHost}-${Date.now()}.txt`;

    const upload = await supabase.storage
      .from("nectar-documents")
      .upload(objectPath, snapshotBytes, {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
      });
    if (upload.error)
      throw new Error(`Snapshot upload failed: ${upload.error.message}`);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const docType =
      data.authoritativeKind === "state_sow"
        ? "sow"
        : data.authoritativeKind === "provider_contract"
          ? "contract"
          : "other";

    const { data: doc, error: insertErr } = await supabase
      .from("nectar_documents")
      .insert({
        organization_id: data.organizationId,
        owner_kind: "company",
        document_type: docType,
        title: data.title.trim(),
        version: 1,
        is_current: true,
        effective_start: data.effectiveStart ?? null,
        effective_end: data.effectiveEnd ?? null,
        fiscal_year: data.fiscalYear ?? null,
        external_ids: {
          source_url: parsedUrl.toString(),
          source_host: parsedUrl.host,
          captured_at: capturedAt,
        },
        tags: ["authoritative-source", data.authoritativeKind, "web-source"],
        storage_path: objectPath,
        file_name: `${safeHost} (captured ${capturedAt.slice(0, 10)}).txt`,
        mime_type: "text/plain",
        file_size_bytes: snapshotBytes.byteLength,
        source: "web",
        parse_status: "parsed",
        parsed_at: capturedAt,
        raw_text: text.slice(0, 50000),
        is_authoritative_source: true,
        authoritative_kind: data.authoritativeKind,
        uploaded_by: userId,
        uploaded_by_name:
          (profile?.full_name as string) ?? (profile?.email as string) ?? null,
        metadata: { page_title: pageTitle, captured_at: capturedAt },
      })
      .select("id, title")
      .single();
    if (insertErr || !doc)
      throw new Error(insertErr?.message ?? "Insert failed");

    return {
      documentId: doc.id as string,
      capturedAt,
      sourceUrl: parsedUrl.toString(),
      textLength: text.length,
    };
  });

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

// SOW/contract requirements live as prose clauses, not tabular fields.
// We ask the AI to read narrative text and pull obligations + required
// documents directly. Source-citation always carried; nothing fabricated.
const REQ_SYSTEM_PROMPT = `You are NECTAR, reading a Utah DSPD provider's State Scope of Work, provider contract, or DSPD/DHS requirement document.

Your job is to extract REQUIREMENTS the provider must meet — written as prose clauses, numbered sections, "the Provider shall…", "must maintain…", "required documents include…", etc. This is narrative text, NOT a structured table.

Return STRICT JSON only, shape:
{
  "requirements": [
    {
      "title": "short imperative phrase, <=140 chars",
      "description": "exact or close paraphrase of the obligation, <=600 chars",
      "category": "audit_doc" | "obligation" | "rule" | "billing",
      "citation": "best locator you can identify, e.g. '§4.2', 'Section 3.1', 'page 7', 'Attachment A'",
      "applies_to": "company" | "staff" | "client"
    }
  ]
}

Rules:
- Only include items actually stated in the document text. Do NOT invent.
- "category":
    audit_doc  = a document the provider must produce, retain, or submit (PCSPs on file, incident reports, training records, etc.)
    obligation = a thing the provider must do (notify within X hours, conduct annual review, maintain insurance, etc.)
    rule       = a constraint / prohibition (no overlapping services, staff-to-client ratio caps, etc.)
    billing    = a billing/reimbursement requirement (EVV, claim timeliness, prior auth)
- Prefer fewer high-quality items over many vague ones.
- If the text contains no requirement language at all, return {"requirements": []}.`;

const ReqItem = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(["audit_doc", "obligation", "rule", "billing"]).optional().nullable(),
  citation: z.string().max(200).optional().nullable(),
  applies_to: z.enum(["company", "staff", "client"]).optional().nullable(),
});
const ReqExtraction = z.object({ requirements: z.array(ReqItem).max(200).default([]) });

async function extractRequirementsFromText(text: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: REQ_SYSTEM_PROMPT },
        { role: "user", content: `DOCUMENT TEXT:\n\n${text.slice(0, 60000)}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
  if (res.status === 402)
    throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "{}";
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    raw = {};
  }
  const parsed = ReqExtraction.safeParse(raw);
  return parsed.success ? parsed.data.requirements : [];
}

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
      .select(
        "id, organization_id, title, raw_text, authoritative_kind, is_authoritative_source, parse_status, file_name, mime_type",
      )
      .eq("id", data.documentId)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Document not found");
    if (!doc.is_authoritative_source)
      throw new Error("Document is not marked as an authoritative source.");

    const rawText = ((doc.raw_text as string | null) ?? "").trim();
    const letterCount = (rawText.match(/[a-zA-Z]/g) ?? []).length;

    // Guardrail: if no text was extracted (likely a scanned/image PDF) tell
    // the user clearly and offer the manual path — never fabricate.
    if (rawText.length < 400 || letterCount < 100) {
      const looksLikePdf =
        (doc.mime_type as string | null)?.toLowerCase().includes("pdf") ||
        ((doc.file_name as string | null) ?? "").toLowerCase().endsWith(".pdf");
      const reason = looksLikePdf
        ? "Couldn't read enough text from this PDF — it may be a scanned image. Try uploading a text-based PDF (export from Word/Pages, or run OCR first). You can still add requirements by hand from the Requirements tab."
        : "No readable text was extracted from this file. You can still add requirements by hand from the Requirements tab.";
      return { inserted: 0, reason: "no_text" as const, message: reason };
    }

    // Existing requirements (so we can de-dupe across re-runs)
    const { data: existing } = await supabase
      .from("nectar_requirements")
      .select("requirement_key")
      .eq("organization_id", doc.organization_id)
      .eq("source_document_id", doc.id);
    const existingKeys = new Set(
      (existing ?? []).map((r) => (r.requirement_key as string) ?? ""),
    );

    // 1. Prose-clause extraction (the real path for SOW / contracts)
    let aiItems: Array<{
      title: string;
      description?: string | null;
      category?: "audit_doc" | "obligation" | "rule" | "billing" | null;
      citation?: string | null;
      applies_to?: "company" | "staff" | "client" | null;
    }> = [];
    try {
      aiItems = await extractRequirementsFromText(rawText);
    } catch (err) {
      // Surface AI errors as a soft failure (e.g. rate-limit/credits) so the
      // user can retry rather than seeing a silent 0.
      return {
        inserted: 0,
        reason: "ai_error" as const,
        message: (err as Error).message,
      };
    }

    // 2. Legacy fallback — any sow_clause fields the generic extractor caught
    const { data: fields } = await supabase
      .from("nectar_extracted_fields")
      .select("field_key, field_group, value_text, source_locator")
      .eq("document_id", data.documentId);
    const sowFields = (fields ?? []).filter(
      (f) => (f.field_group as string | null) === "sow_clause",
    );

    let inserted = 0;

    for (const item of aiItems) {
      const titleClean = item.title.trim().slice(0, 200);
      if (!titleClean) continue;
      const key = `${(doc.authoritative_kind as string) ?? "src"}:ai:${titleClean}:${item.citation ?? ""}`
        .toLowerCase()
        .slice(0, 120);
      if (existingKeys.has(key)) continue;
      const citation = item.citation
        ? `${(doc.title as string) ?? "Source"} — ${item.citation}`
        : (doc.title as string) ?? null;
      const { error } = await supabase.from("nectar_requirements").insert({
        organization_id: doc.organization_id,
        source_document_id: doc.id,
        origin: "document",
        requirement_key: key,
        title: titleClean,
        description: item.description ?? null,
        category: item.category ?? "obligation",
        source_citation: citation,
        applies_to: item.applies_to ?? "company",
      });
      if (!error) {
        existingKeys.add(key);
        inserted += 1;
      }
    }

    for (const f of sowFields) {
      const title =
        (f.value_text as string | null)?.slice(0, 180) ??
        `Requirement: ${f.field_key}`;
      const citation = (f.source_locator as string | null) ?? null;
      const key = `${(doc.authoritative_kind as string) ?? "src"}:${f.field_key as string}:${(f.source_locator as string | null) ?? ""}`
        .toLowerCase()
        .slice(0, 120);
      if (existingKeys.has(key)) continue;
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
      if (!error) {
        existingKeys.add(key);
        inserted += 1;
      }
    }

    if (inserted === 0) {
      return {
        inserted: 0,
        reason: "no_requirements" as const,
        message:
          "NECTAR read the document but didn't find clear requirement language (\"shall…\", \"must…\", required documents, etc.). If this source does contain obligations, add them by hand from the Requirements tab.",
      };
    }

    return { inserted, reason: "ok" as const };
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
