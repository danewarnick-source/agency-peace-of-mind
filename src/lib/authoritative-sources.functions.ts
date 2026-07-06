import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import type { Json } from "@/integrations/supabase/types";
import { reportPlatformEvent } from "./hive-tickets.functions";
import { markDraftedByNectar } from "./nectar-approvals.functions";
import { EVV_SERVICE_CODES } from "./evv-codes";
import {
  AUTH_KINDS,
  NON_OBLIGATION_KINDS,
  stripHtmlToText,
  extractRequirementsFromText,
  extractChunkWithRetry,
  chunkDocumentRanges,
  isTransientAIError,
  EXPLAIN_SYSTEM_PROMPT,
  ExplainResp,
} from "./authoritative-sources.server";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

// =============================================================
// Foundation B — Authoritative sources, derived requirements,
// and the immutable attestation log.
// HIVE organizes; the company's uploaded documents are the source of truth.
// Shared helpers/prompts/schemas live in ./authoritative-sources.server.ts
// to avoid ?tss-serverfn-split ReferenceErrors from sibling declarations.
// =============================================================

/**
 * Build the in-memory dedup key for an AI-drafted requirement.
 * Normalizes the title so trivial differences (punctuation, casing,
 * whitespace, quotes) don't produce phantom duplicates when the same
 * clause is extracted twice by overlapping chunks.
 */
function buildRequirementDedupKey(kind: string, title: string): string {
  const norm = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return "";
  return `${kind}:ai:${norm}`.slice(0, 120);
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
        assistedSetup: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");


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
        assisted_setup_requested: data.assistedSetup ?? false,
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
    // Sources tab shows every company-owned doc — the authoritative flag /
    // authoritative_kind just controls whether NECTAR can draft from it yet.
    // Client/staff docs stay filtered out so PHI-scoped files don't leak in.
    const { data: rows, error } = await supabase
      .from("nectar_documents")
      .select(
        "id, title, document_type, authoritative_kind, fiscal_year, effective_start, effective_end, file_name, uploaded_by_name, created_at, parse_status, is_current, version, is_authoritative_source, metadata",
      )
      .eq("organization_id", data.organizationId)
      .in("owner_kind", ["company", "state"])
      .order("is_authoritative_source", { ascending: false })
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
        assistedSetup: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: docRow } = await supabase
      .from("nectar_documents")
      .select("organization_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!docRow?.organization_id) throw new Error("Document not found");
    await requireOrgMembership(supabase, userId, docRow.organization_id as string, "manager");
    const update: {
      is_authoritative_source: boolean;
      authoritative_kind: string | null;
      assisted_setup_requested?: boolean;
    } = {
      is_authoritative_source: data.isAuthoritative,
      authoritative_kind: data.isAuthoritative ? data.authoritativeKind : null,
    };
    if (typeof data.assistedSetup === "boolean") {
      update.assisted_setup_requested = data.assistedSetup;
    }
    const { error } = await supabase
      .from("nectar_documents")
      .update(update)
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Ignore / archive / mark-as-duplicate ----------
// We never hard-delete an authoritative source. Setting one aside flips a
// flag in metadata, dims it in the list, and excludes it from active use
// (NECTAR stops drafting; it no longer counts toward the active source set).
// Reactivating restores it. Every transition is logged to the attestation
// trail so audit-readiness changes are deliberate, not silent.

export const setSourceIgnoreState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        documentId: z.string().uuid(),
        action: z.enum(["ignore", "duplicate", "reactivate"]),
        reason: z.string().max(2000).optional().nullable(),
        duplicateOfId: z.string().uuid().optional().nullable(),
        existingRequirementsChoice: z
          .enum(["keep_active", "leave_as_is", "none"])
          .default("none"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: dErr } = await supabase
      .from("nectar_documents")
      .select("id, organization_id, title, authoritative_kind, metadata")
      .eq("id", data.documentId)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Source not found");
    await requireOrgMembership(supabase, userId, doc.organization_id as string, "manager");

    let duplicateOfTitle: string | null = null;
    if (data.action === "duplicate") {
      if (!data.duplicateOfId) {
        throw new Error(
          "Pick which source this duplicates so the trail records it.",
        );
      }
      if (data.duplicateOfId === data.documentId) {
        throw new Error("A source can't be a duplicate of itself.");
      }
      const { data: dup } = await supabase
        .from("nectar_documents")
        .select("id, title, organization_id")
        .eq("id", data.duplicateOfId)
        .maybeSingle();
      if (!dup || (dup.organization_id as string) !== (doc.organization_id as string)) {
        throw new Error("Duplicate-of source must belong to the same workspace.");
      }
      duplicateOfTitle = (dup.title as string | null) ?? null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const actorName =
      (profile?.full_name as string) ?? (profile?.email as string) ?? null;
    const nowIso = new Date().toISOString();
    const prevMeta = (doc.metadata ?? {}) as Record<string, unknown>;

    const nextMeta: Record<string, unknown> = { ...prevMeta };
    if (data.action === "reactivate") {
      delete nextMeta.ignored;
      delete nextMeta.ignored_at;
      delete nextMeta.ignored_by;
      delete nextMeta.ignored_by_name;
      delete nextMeta.ignored_reason;
      delete nextMeta.ignored_as;
      delete nextMeta.duplicate_of_id;
      delete nextMeta.duplicate_of_title;
      nextMeta.reactivated_at = nowIso;
      nextMeta.reactivated_by = userId;
      nextMeta.reactivated_by_name = actorName;
    } else {
      nextMeta.ignored = true;
      nextMeta.ignored_as = data.action;
      nextMeta.ignored_at = nowIso;
      nextMeta.ignored_by = userId;
      nextMeta.ignored_by_name = actorName;
      nextMeta.ignored_reason = data.reason ?? null;
      if (data.action === "duplicate") {
        nextMeta.duplicate_of_id = data.duplicateOfId;
        nextMeta.duplicate_of_title = duplicateOfTitle;
      }
    }

    const { error: uErr } = await supabase
      .from("nectar_documents")
      .update({ metadata: nextMeta as Json })
      .eq("id", data.documentId);
    if (uErr) throw new Error(uErr.message);

    // Capture audit-readiness impact at decision time.
    const { data: reqs } = await supabase
      .from("nectar_requirements")
      .select("id, review_status")
      .eq("source_document_id", data.documentId);
    const total = reqs?.length ?? 0;
    const confirmed = (reqs ?? []).filter(
      (r) => (r.review_status as string | null) === "confirmed",
    ).length;

    const baseStatement =
      data.action === "reactivate"
        ? `Reactivated authoritative source "${doc.title}". NECTAR will resume drafting from it; existing requirements remain as-is.`
        : data.action === "duplicate"
          ? `Set aside authoritative source "${doc.title}" as a duplicate of "${duplicateOfTitle ?? "another source"}". NECTAR will stop drafting from it.`
          : `Set aside authoritative source "${doc.title}". NECTAR will stop drafting from it; the record is retained.`;

    const reqClause =
      data.action !== "reactivate" && total > 0
        ? ` ${total} requirement${total === 1 ? "" : "s"} were previously drafted (${confirmed} confirmed); admin chose to ${
            data.existingRequirementsChoice === "keep_active"
              ? "KEEP those requirements active in the engine"
              : data.existingRequirementsChoice === "leave_as_is"
                ? "LEAVE them as-is (manual cleanup if needed)"
                : "proceed without changing them"
          }.`
        : "";

    const reasonClause = data.reason?.trim() ? ` Reason: ${data.reason.trim()}` : "";

    await supabase.from("nectar_attestations").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      user_display_name: actorName,
      scope: "document_upload",
      scope_ref_id: doc.id,
      scope_ref_type: "nectar_document",
      statement: `${baseStatement}${reqClause}${reasonClause}`,
      context: {
        action: data.action,
        document_title: doc.title,
        authoritative_kind: doc.authoritative_kind,
        duplicate_of_id: data.duplicateOfId ?? null,
        duplicate_of_title: duplicateOfTitle,
        reason: data.reason ?? null,
        requirements_total: total,
        requirements_confirmed: confirmed,
        existing_requirements_choice: data.existingRequirementsChoice,
      },
    });

    return { ok: true, requirementsTotal: total, requirementsConfirmed: confirmed };
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
        // NOTE: service_code + service_codes_all are required by the
        // derived scope_state calculation below. Do not remove them from
        // this select — the auto set-aside behavior will silently break
        // (every doc-origin requirement collapses to in_scope).
        "id, source_document_id, origin, requirement_key, title, description, category, source_citation, applies_to, verified, verified_by, verified_at, review_status, created_at, metadata, service_code, service_codes_all",
      )
      .eq("organization_id", data.organizationId)
      .order("origin", { ascending: true })
      .order("category", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true });
    if (data.origin) q = q.eq("origin", data.origin);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Lightweight source-doc lookup for citation rendering / grouping.
    const sourceIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.source_document_id as string | null)
          .filter((x): x is string => !!x),
      ),
    );
    const sourcesById: Record<
      string,
      {
        id: string;
        title: string;
        authoritative_kind: string | null;
        fiscal_year: string | null;
        file_name: string | null;
        created_at: string | null;
      }
    > = {};
    if (sourceIds.length) {
      const { data: srcs } = await supabase
        .from("nectar_documents")
        .select("id, title, authoritative_kind, fiscal_year, file_name, created_at")
        .in("id", sourceIds);
      for (const s of srcs ?? [])
        sourcesById[s.id as string] = {
          id: s.id as string,
          title: s.title as string,
          authoritative_kind: (s.authoritative_kind as string | null) ?? null,
          fiscal_year: (s.fiscal_year as string | null) ?? null,
          file_name: (s.file_name as string | null) ?? null,
          created_at: (s.created_at as string | null) ?? null,
        };
    }

    // ---- Auto set-aside: out-of-scope service codes ----
    // For requirements DRAFTED FROM AN AUTHORITATIVE SOURCE (origin =
    // 'document'), if every service code they reference is one this org
    // is NOT currently authorized for (active OR future/held), tag the
    // row scope_state = 'out_of_scope' so the UI can visibly set it aside
    // — separate from the manual removal flow. Reversible: derived on
    // every read from provider_authorized_codes.
    const { data: authRows } = await supabase
      .from("provider_authorized_codes")
      .select("code, archived_at")
      .eq("organization_id", data.organizationId);
    const authorizedCodes = new Set(
      (authRows ?? [])
        .filter((r) => (r as { archived_at: string | null }).archived_at == null)
        .map((r) => String((r as { code: string }).code).toUpperCase()),
    );

    const enriched = (rows ?? []).map((r) => {
      const row = r as {
        origin: string;
        service_code: string | null;
        service_codes_all: string[] | null;
      };
      if (row.origin !== "document") {
        return { ...r, scope_state: "in_scope" as const, out_of_scope_codes: [] as string[] };
      }
      const codes = new Set<string>();
      if (row.service_code) codes.add(String(row.service_code).toUpperCase());
      for (const c of row.service_codes_all ?? []) {
        if (c) codes.add(String(c).toUpperCase());
      }
      if (codes.size === 0) {
        // Org-wide obligation with no code tie — leave to normal review flow.
        return { ...r, scope_state: "in_scope" as const, out_of_scope_codes: [] as string[] };
      }
      const offending: string[] = [];
      let anyInScope = false;
      for (const c of codes) {
        if (authorizedCodes.has(c)) anyInScope = true;
        else offending.push(c);
      }
      return {
        ...r,
        scope_state: (anyInScope ? "in_scope" : "out_of_scope") as
          | "in_scope"
          | "out_of_scope",
        out_of_scope_codes: anyInScope ? [] : offending,
      };
    });

    return { requirements: enriched, sourcesById };
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
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
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
    // Manual entries are confirmed-on-create (the admin typed them in);
    // document/suggestion inserts default to needs_attention via the column default.
    const insertPayload =
      data.origin === "manual"
        ? { ...payload, review_status: "confirmed", verified: true, verified_by: context.userId, verified_at: new Date().toISOString() }
        : payload;
    const { data: row, error } = await supabase
      .from("nectar_requirements")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id as string };
  });

export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reqRow } = await supabase
      .from("nectar_requirements")
      .select("organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!reqRow?.organization_id) throw new Error("Requirement not found");
    await requireOrgMembership(supabase, userId, reqRow.organization_id as string, "manager");
    const { error } = await supabase
      .from("nectar_requirements")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Persistent review state ----------
// Confirm / Remove / Re-open. We never hard-delete a NECTAR-drafted
// requirement — "removed" rows stay so the admin has a complete record
// of what was intentionally excluded. Every transition logs an attestation.

export const setRequirementReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["confirmed", "removed", "needs_attention"]),
        attestStatement: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: gErr } = await supabase
      .from("nectar_requirements")
      .select(
        "id, organization_id, title, source_document_id, source_citation, review_status",
      )
      .eq("id", data.id)
      .single();
    if (gErr || !req) throw new Error(gErr?.message ?? "Requirement not found");
    await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");


    const nowIso = new Date().toISOString();
    const patch =
      data.status === "confirmed"
        ? {
            review_status: "confirmed" as const,
            verified: true,
            verified_by: userId,
            verified_at: nowIso,
          }
        : {
            review_status: data.status,
            verified: false,
            verified_by: null,
            verified_at: null,
          };

    const { error } = await supabase
      .from("nectar_requirements")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);


    // Source-doc context for the attestation log
    let sourceTitle: string | null = null;
    if (req.source_document_id) {
      const { data: src } = await supabase
        .from("nectar_documents")
        .select("title")
        .eq("id", req.source_document_id as string)
        .maybeSingle();
      sourceTitle = (src?.title as string | null) ?? null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const defaultStatement =
      data.status === "confirmed"
        ? `Confirmed requirement "${req.title}" as accurate and applicable to my agency${sourceTitle ? ` (from "${sourceTitle}")` : ""}.`
        : data.status === "removed"
          ? `Removed requirement "${req.title}" from the active set${sourceTitle ? ` (drafted from "${sourceTitle}")` : ""}. NECTAR will stop pulling from it; the record is retained for the review trail.`
          : `Re-opened requirement "${req.title}" for review${sourceTitle ? ` (drafted from "${sourceTitle}")` : ""}.`;

    const statement = data.attestStatement?.trim()
      ? data.attestStatement.trim()
      : defaultStatement;

    await supabase.from("nectar_attestations").insert({
      organization_id: req.organization_id,
      user_id: userId,
      user_display_name:
        (profile?.full_name as string) ?? (profile?.email as string) ?? null,
      scope: "requirement_verify",
      scope_ref_id: req.id,
      scope_ref_type: "nectar_requirement",
      statement,
      context: {
        requirement_title: req.title,
        source_document_id: req.source_document_id,
        source_document_title: sourceTitle,
        source_citation: req.source_citation,
        previous_status: req.review_status,
        new_status: data.status,
        user_acknowledged: !!data.attestStatement,
      },
    });

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
    await requireOrgMembership(supabase, userId, req.organization_id as string, "manager");


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
    const { supabase, userId } = context;
    const { data: doc, error: dErr } = await supabase
      .from("nectar_documents")
      .select(
        "id, organization_id, title, raw_text, authoritative_kind, is_authoritative_source, parse_status, file_name, mime_type, source, external_ids, metadata, assisted_setup_requested",
      )
      .eq("id", data.documentId)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Document not found");
    await requireOrgMembership(supabase, userId, doc.organization_id as string, "manager");
    if (!doc.is_authoritative_source)
      throw new Error("Document is not marked as an authoritative source.");

    // Preflight: drafting writes to nectar_requirements, which is gated by
    // is_org_admin_or_manager. Surface a clear message instead of letting RLS
    // throw a cryptic permission error.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role, active")
      .eq("organization_id", doc.organization_id)
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    const allowedRoles = new Set(["admin", "manager", "super_admin"]);
    if (!membership || !allowedRoles.has(membership.role as string)) {
      throw new Error(
        "Drafting requirements is an Admin View action. Switch to this company's Admin View with an Admin, Manager, or Super Admin role to draft from authoritative sources.",
      );
    }


    const meta = (doc.metadata ?? {}) as { ignored?: boolean };
    if (meta.ignored) {
      throw new Error(
        "This source is set aside (ignored). Reactivate it before drafting requirements.",
      );
    }
    if (NON_OBLIGATION_KINDS.has((doc.authoritative_kind as string) ?? "")) {
      return {
        inserted: 0,
        reason: "non_obligation_kind" as const,
        message:
          "This document is labeled as a tool or template. NECTAR doesn't extract obligations from review/audit tools — change the kind if it actually contains state or contract requirements.",
      };
    }

    const rawText = ((doc.raw_text as string | null) ?? "").trim();
    const letterCount = (rawText.match(/[a-zA-Z]/g) ?? []).length;

    // Resolve triggering org name once for any platform-event reports below.
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", doc.organization_id)
      .maybeSingle();
    const orgName = (orgRow?.name as string | null) ?? null;

    // Guardrail: if no text was extracted (likely a scanned/image PDF) tell
    // the user clearly and offer the manual path — never fabricate.
    if (rawText.length < 400 || letterCount < 100) {
      const looksLikePdf =
        (doc.mime_type as string | null)?.toLowerCase().includes("pdf") ||
        ((doc.file_name as string | null) ?? "").toLowerCase().endsWith(".pdf");
      const reason = looksLikePdf
        ? "Couldn't read enough text from this PDF — it may be a scanned image. Try uploading a text-based PDF (export from Word/Pages, or run OCR first). You can still add requirements by hand from the Requirements tab."
        : "No readable text was extracted from this file. You can still add requirements by hand from the Requirements tab.";
      // Auto-file a HIVE Executive NECTAR ticket: this is the clearest
      // detectable platform-level problem (parsing pipeline can't see text).
      await reportPlatformEvent({
        eventKind: "parsing_no_text",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: looksLikePdf
          ? `Scanned/image PDF won't parse — "${(doc.title as string) ?? doc.file_name}"`
          : `No readable text extracted — "${(doc.title as string) ?? doc.file_name}"`,
        detail: `Document ${doc.id} (${doc.file_name}, ${doc.mime_type ?? "unknown mime"}) yielded ${rawText.length} chars / ${letterCount} letters. NECTAR could not draft any requirements because the parsing pipeline did not return usable text. Likely cause: scanned/image PDF without OCR.`,
        category: "parsing_failure",
        severity: looksLikePdf ? "medium" : "low",
        dedupeKey: `parsing_no_text:${doc.id}`,
        eventRef: {
          documentId: doc.id,
          fileName: doc.file_name,
          mimeType: doc.mime_type,
          rawTextLength: rawText.length,
          letterCount,
        },
        nectarProposal: looksLikePdf
          ? {
              type: "operational",
              summary:
                "Add an image-PDF OCR fallback ahead of the requirements extractor (Tesseract + table-line detection); re-ingest scanned addenda automatically.",
              changeKind: "Ingestion pipeline: OCR fallback stage",
              blastRadius: "Document ingestion only — no schema changes",
              risk: "low",
            }
          : undefined,
      });
      return { inserted: 0, reason: "no_text" as const, message: reason };
    }


    // Existing requirements (so we can de-dupe across re-runs). Seed the key set
    // from titles run through the same normalizer used for new rows, so the
    // check is punctuation/whitespace/case-insensitive and catches rows whose
    // stored requirement_key was written under an older, stricter formula.
    const { data: existing } = await supabase
      .from("nectar_requirements")
      .select("title")
      .eq("organization_id", doc.organization_id)
      .eq("source_document_id", doc.id)
      .neq("review_status", "removed");
    const kind = (doc.authoritative_kind as string) ?? "src";
    const existingKeys = new Set(
      (existing ?? [])
        .map((r) => buildRequirementDedupKey(kind, (r.title as string | null) ?? ""))
        .filter((k) => k.length > 0),
    );

    // 1. Prose-clause extraction (the real path for SOW / contracts)
    let aiItems: Array<{
      title: string;
      description?: string | null;
      category?: "audit_doc" | "obligation" | "rule" | "billing" | null;
      citation?: string | null;
      applies_to?: "company" | "staff" | "client" | null;
    }> = [];
    let chunkCount = 1;
    let chunkFailures: string[] = [];
    try {
      const extraction = await extractRequirementsFromText(rawText);
      aiItems = extraction.items;
      chunkCount = extraction.chunkCount;
      chunkFailures = extraction.chunkFailures;
    } catch (err) {
      // Surface AI errors as a soft failure (e.g. rate-limit/credits) so the
      // user can retry rather than seeing a silent 0.
      const msg = (err as Error).message;
      await reportPlatformEvent({
        eventKind: "ai_error",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Requirements extractor failed on "${(doc.title as string) ?? doc.file_name}"`,
        detail: `AI extraction call threw while drafting from document ${doc.id}. Message: ${msg.slice(0, 600)}`,
        category: "parsing_failure",
        severity: "medium",
        dedupeKey: `ai_error:${doc.id}`,
        eventRef: { documentId: doc.id, error: msg.slice(0, 400) },
      });
      return {
        inserted: 0,
        reason: "ai_error" as const,
        message: msg,
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

    // Web sources cite "per <url>, captured <date>" so the trace points back
    // to the URL + snapshot date rather than a generic file name.
    const ext = (doc.external_ids ?? {}) as {
      source_url?: string;
      captured_at?: string;
    };
    const isWeb = (doc.source as string | null) === "web" && !!ext.source_url;
    const webSuffix = isWeb
      ? ` (per ${ext.source_url}${
          ext.captured_at ? `, captured ${ext.captured_at.slice(0, 10)}` : ""
        })`
      : "";
    const baseLabel = (doc.title as string) ?? "Source";

    let inserted = 0;
    const assisted = (doc.assisted_setup_requested as boolean | null) === true;

    // Build rows up-front, dedupe against existing keys, then bulk-insert in
    // groups. Per-row inserts against a 260k-char SOW easily exceed the
    // server-function wall-clock; a handful of batches finishes in seconds.
    type AiRow = {
      organization_id: string;
      source_document_id: string;
      origin: "document";
      requirement_key: string;
      title: string;
      description: string | null;
      category: "audit_doc" | "obligation" | "rule" | "billing";
      source_citation: string;
      applies_to: "company" | "staff" | "client";
      approval_state: string | null;
    };
    const aiRows: Array<{ row: AiRow; key: string }> = [];
    for (const item of aiItems) {
      const titleClean = item.title.trim().slice(0, 200);
      if (!titleClean) continue;
      // Dedup by normalized title + source document. Title is normalized
      // (case/punctuation/whitespace-insensitive) via buildRequirementDedupKey
      // so chunk-overlap re-extractions with trivial phrasing differences
      // don't slip through. existingKeys is already scoped to this document.
      const key = buildRequirementDedupKey(kind, titleClean);
      if (!key) continue;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const citation = item.citation
        ? `${baseLabel} — ${item.citation}${webSuffix}`
        : `${baseLabel}${webSuffix}`;
      aiRows.push({
        key,
        row: {
          organization_id: doc.organization_id,
          source_document_id: doc.id,
          origin: "document",
          requirement_key: key,
          title: titleClean,
          description: item.description ?? null,
          category: item.category ?? "obligation",
          source_citation: citation,
          applies_to: item.applies_to ?? "company",
          approval_state: assisted ? "nectar_drafted" : null,
        },
      });
    }

    const BATCH = 100;
    for (let i = 0; i < aiRows.length; i += BATCH) {
      const slice = aiRows.slice(i, i + BATCH);
      const { data: insRows, error } = await supabase
        .from("nectar_requirements")
        .insert(slice.map((s) => s.row))
        .select("id");
      if (error) {
        // Roll back the optimistic existingKeys additions for this slice so a
        // retry can re-attempt them.
        for (const s of slice) existingKeys.delete(s.key);
        throw new Error(`Requirement insert failed: ${error.message}`);
      }
      inserted += insRows?.length ?? 0;
      if (assisted && insRows) {
        for (const ins of insRows) {
          await markDraftedByNectar({
            organizationId: doc.organization_id as string,
            requirementId: ins.id as string,
          });
        }
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
      const { data: ins, error } = await supabase
        .from("nectar_requirements")
        .insert({
          organization_id: doc.organization_id,
          source_document_id: doc.id,
          origin: "document",
          requirement_key: key,
          title,
          description: (f.value_text as string | null) ?? null,
          category:
            (f.field_key as string) === "required_document" ? "audit_doc" : "obligation",
          source_citation: citation
            ? `${baseLabel} — ${citation}${webSuffix}`
            : `${baseLabel}${webSuffix}`,
          applies_to: "company",
          approval_state: assisted ? "nectar_drafted" : null,
        })
        .select("id")
        .single();
      if (!error && ins) {
        existingKeys.add(key);
        inserted += 1;
        if (assisted) {
          await markDraftedByNectar({
            organizationId: doc.organization_id as string,
            requirementId: ins.id as string,
          });
        }
      }
    }

    // --- Auto-emit: mapping_gap ---------------------------------------------
    // For each requirement the extractor SUCCESSFULLY read but couldn't map
    // to a known HIVE category bucket (the system's only structural
    // classification today), file a per-requirement HIVE ticket. Certain
    // signal: extraction returned it, item.category is null/unknown.
    const KNOWN_REQ_CATEGORIES = new Set([
      "audit_doc",
      "obligation",
      "rule",
      "billing",
    ]);
    for (const item of aiItems) {
      const titleClean = item.title.trim().slice(0, 200);
      if (!titleClean) continue;
      const cat = (item.category ?? "").toString();
      if (cat && KNOWN_REQ_CATEGORIES.has(cat)) continue;
      const reqKey = `${(doc.authoritative_kind as string) ?? "src"}:ai:${titleClean}:${item.citation ?? ""}`
        .toLowerCase()
        .slice(0, 120);
      await reportPlatformEvent({
        eventKind: "requirement_unmapped",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Unmapped requirement — "${titleClean.slice(0, 120)}"`,
        detail: `NECTAR extracted a requirement from document ${doc.id} ("${(doc.title as string) ?? doc.file_name}") but could not map it to a known HIVE category bucket (audit_doc / obligation / rule / billing). Extracted title: "${titleClean}". Citation: ${item.citation ?? "(none)"}. Applies to: ${item.applies_to ?? "(unset)"}.`,
        category: "mapping_gap",
        severity: "low",
        dedupeKey: `requirement_unmapped:${doc.id}:${reqKey}`,
        eventRef: {
          documentId: doc.id,
          requirementKey: reqKey,
          extractedTitle: titleClean,
          extractedCategory: item.category ?? null,
          citation: item.citation ?? null,
          appliesTo: item.applies_to ?? null,
        },
      });
    }

    // --- Auto-emit: expansion_need (NARROW) ---------------------------------
    // Scan the source text for service-code-like tokens cited in canonical
    // DSPD patterns ("code XXX", "(XXX)", "XXX — Label"). Any token that
    // doesn't appear in HIVE's known service-code registry is a wholly
    // unknown code/structure HIVE has no template for — fire one ticket per
    // distinct unknown code, deduped globally so re-runs / other docs don't
    // duplicate. Strategic / addendum-pattern expansion stays MANUAL.
    const knownCodes = new Set(EVV_SERVICE_CODES.map((c) => c.code));
    const codeCandidates = new Set<string>();
    const codeRegexes: RegExp[] = [
      /\bcodes?\s+([A-Z]{2,4}\d?)\b/g,
      /\bservice\s+codes?\s+([A-Z]{2,4}\d?)\b/g,
      /\(([A-Z]{2,4}\d?)\)/g,
      /\b([A-Z]{2,4}\d?)\s*[-—–]\s*[A-Z][a-z]/g,
    ];
    for (const rx of codeRegexes) {
      let m: RegExpExecArray | null;
      while ((m = rx.exec(rawText)) !== null) {
        const tok = m[1];
        if (!tok) continue;
        if (knownCodes.has(tok)) continue;
        // Skip obvious English false-positives in the all-caps capture.
        if (/^(THE|AND|FOR|ALL|NOT|YOU|ARE|WAS|WITH|FROM|HAS|HAD|USA|LLC|INC|CFR|USC|DSP|DHS|DHHS|DSPD|SOW|PDF|PCSP|HCBS|EVV|UPI|UEVV)$/.test(tok)) continue;
        codeCandidates.add(tok);
      }
    }
    for (const code of codeCandidates) {
      const snippetMatch = rawText.match(
        new RegExp(`.{0,80}\\b${code}\\b.{0,80}`),
      );
      const snippet = snippetMatch ? snippetMatch[0].replace(/\s+/g, " ").trim() : null;
      await reportPlatformEvent({
        eventKind: "unknown_code_structure",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Unknown code/structure "${code}" — no HIVE template`,
        detail: `Authoritative source ${doc.id} ("${(doc.title as string) ?? doc.file_name}") references "${code}", which is not in HIVE's known service-code registry. HIVE has no template for this code/structure yet.${snippet ? ` Context: "${snippet.slice(0, 280)}"` : ""}`,
        category: "expansion_need",
        severity: "low",
        // Global dedupe on the code itself — same unknown code across docs/
        // orgs collapses into one open ticket.
        dedupeKey: `unknown_code_structure:${code}`,
        eventRef: {
          documentId: doc.id,
          unknownCode: code,
          contextSnippet: snippet,
        },
      });
    }

    if (inserted === 0) {
      // If any chunks failed to parse, this is an "extractor incomplete"
      // situation, not a "no obligations" one — say so clearly and file a
      // distinct HIVE ticket. Re-clicking Draft retries.
      if (chunkFailures.length > 0) {
        await reportPlatformEvent({
          eventKind: "ai_error",
          organizationId: doc.organization_id as string,
          organizationName: orgName,
          title: `Extractor couldn't finish "${(doc.title as string) ?? doc.file_name}"`,
          detail: `Document ${doc.id} (${rawText.length} chars) was split into ${chunkCount} sections; ${chunkFailures.length} failed to parse and yielded 0 requirements. First failure: ${chunkFailures[0]?.slice(0, 300)}`,
          category: "parsing_failure",
          severity: "medium",
          dedupeKey: `extractor_incomplete:${doc.id}`,
          eventRef: {
            documentId: doc.id,
            chunkCount,
            failedChunks: chunkFailures.length,
            firstFailure: chunkFailures[0]?.slice(0, 400),
          },
        });
        return {
          inserted: 0,
          reason: "extractor_incomplete" as const,
          message: `NECTAR couldn't finish reading this document — ${chunkFailures.length} of ${chunkCount} sections failed to parse. First failure: ${chunkFailures[0]?.slice(0, 200) ?? "(unknown)"}. Click Draft again to retry.`,
        };
      }

      // Document parsed cleanly but yielded zero requirements. Worth a HIVE
      // ticket for the platform team to investigate — either the extractor
      // missed obligation language, or the document genuinely has none.
      await reportPlatformEvent({
        eventKind: "no_requirements_found",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Extractor returned 0 requirements from "${(doc.title as string) ?? doc.file_name}"`,
        detail: `Document ${doc.id} parsed cleanly (${rawText.length} chars, ${letterCount} letters) but produced no drafted requirements after both prose-clause extraction and SOW-field fallback. Either the obligation language is phrased outside the extractor's patterns, or the document doesn't contain requirements. Kind: ${(doc.authoritative_kind as string) ?? "(none)"}.`,
        category: "parsing_failure",
        severity: "low",
        dedupeKey: `no_requirements:${doc.id}`,
        eventRef: {
          documentId: doc.id,
          authoritativeKind: doc.authoritative_kind,
          rawTextLength: rawText.length,
        },
      });
      return {
        inserted: 0,
        reason: "no_requirements" as const,
        message:
          "NECTAR read the document but didn't find clear requirement language (\"shall…\", \"must…\", required documents, etc.). If this source does contain obligations, add them by hand from the Requirements tab.",
      };
    }

    if (chunkFailures.length > 0) {
      await reportPlatformEvent({
        eventKind: "ai_error",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Partial extract on "${(doc.title as string) ?? doc.file_name}"`,
        detail: `Document ${doc.id}: ${inserted} requirements drafted; ${chunkFailures.length} of ${chunkCount} sections failed to parse. First failure: ${chunkFailures[0]?.slice(0, 300)}`,
        category: "parsing_failure",
        severity: "low",
        dedupeKey: `extractor_incomplete:${doc.id}`,
        eventRef: {
          documentId: doc.id,
          chunkCount,
          failedChunks: chunkFailures.length,
          inserted,
        },
      });
      return {
        inserted,
        reason: "partial" as const,
        message: `Drafted ${inserted} requirements. ${chunkFailures.length} of ${chunkCount} sections couldn't be read on this pass (first failure: ${chunkFailures[0]?.slice(0, 200) ?? "unknown"}). Click Draft again to retry those sections.`,

      };
    }

    return { inserted, reason: "ok" as const };
  });

// =============================================================
// Chunk-at-a-time drafting pipeline.
//
// The monolithic generateRequirementsFromSource above stalls on long SOWs
// because a single server-fn call has to do chunking, N Gemini calls,
// dedup, batch inserts, and dozens of HIVE-ticket writes — easily blowing
// past the worker wall-clock. The pipeline below splits the work into
// three narrow server fns the client drives step-by-step, so each call
// stays well inside the wall-clock and the client sees real progress.
// =============================================================

type DraftItem = {
  title: string;
  description?: string | null;
  category?: "audit_doc" | "obligation" | "rule" | "billing" | null;
  citation?: string | null;
  applies_to?: "company" | "staff" | "client" | null;
};

async function loadDraftJobDoc(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  jobId: string,
  userId: string,
) {
  const { data: job, error } = await supabase
    .from("nectar_draft_jobs")
    .select(
      "id, organization_id, document_id, status, total_chunks, processed_chunks, processed_indices, started_at, chunk_durations_ms, chunk_ranges, extracted_items, chunk_failures",
    )
    .eq("id", jobId)
    .single();
  if (error || !job) throw new Error(error?.message ?? "Draft job not found");
  await requireOrgMembership(
    supabase,
    userId,
    job.organization_id as string,
    "manager",
  );
  return job;
}

export const startRequirementsDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: dErr } = await supabase
      .from("nectar_documents")
      .select(
        "id, organization_id, title, raw_text, authoritative_kind, is_authoritative_source, file_name, mime_type, metadata",
      )
      .eq("id", data.documentId)
      .single();
    if (dErr || !doc) throw new Error(dErr?.message ?? "Document not found");
    await requireOrgMembership(
      supabase,
      userId,
      doc.organization_id as string,
      "manager",
    );

    if (!doc.is_authoritative_source)
      throw new Error("Document is not marked as an authoritative source.");

    const meta = (doc.metadata ?? {}) as { ignored?: boolean };
    if (meta.ignored) {
      throw new Error(
        "This source is set aside (ignored). Reactivate it before drafting requirements.",
      );
    }
    if (NON_OBLIGATION_KINDS.has((doc.authoritative_kind as string) ?? "")) {
      return {
        jobId: null as string | null,
        totalChunks: 0,
        reason: "non_obligation_kind" as const,
        message:
          "This document is labeled as a tool or template. NECTAR doesn't extract obligations from review/audit tools — change the kind if it actually contains state or contract requirements.",
      };
    }

    const rawText = ((doc.raw_text as string | null) ?? "").trim();
    const letterCount = (rawText.match(/[a-zA-Z]/g) ?? []).length;
    if (rawText.length < 400 || letterCount < 100) {
      const looksLikePdf =
        (doc.mime_type as string | null)?.toLowerCase().includes("pdf") ||
        ((doc.file_name as string | null) ?? "").toLowerCase().endsWith(".pdf");
      return {
        jobId: null as string | null,
        totalChunks: 0,
        reason: "no_text" as const,
        message: looksLikePdf
          ? "Couldn't read enough text from this PDF — it may be a scanned image. Try uploading a text-based PDF (export from Word/Pages, or run OCR first). You can still add requirements by hand from the Requirements tab."
          : "No readable text was extracted from this file. You can still add requirements by hand from the Requirements tab.",
      };
    }

    const ranges = chunkDocumentRanges(rawText);
    const { data: jobRow, error: jobErr } = await supabase
      .from("nectar_draft_jobs")
      .insert({
        organization_id: doc.organization_id as string,
        document_id: doc.id as string,
        created_by: userId,
        status: "extracting",
        total_chunks: ranges.length,
        processed_chunks: 0,
        chunk_ranges: ranges as unknown as Json,
        extracted_items: [] as unknown as Json,
        chunk_failures: [] as unknown as Json,
      })
      .select("id")
      .single();
    if (jobErr || !jobRow) throw new Error(jobErr?.message ?? "Could not start draft job");

    // The mounted client driver is the active-page worker. Do not also start
    // the server tick here: for large SOWs that briefly doubled concurrency
    // (client 2 + tick 2) and could trigger the AI rate limit before pacing
    // had a chance to help. The tab-hide/pagehide nudge still starts the
    // server tick when the user actually leaves the page.

    return {
      jobId: jobRow.id as string,
      totalChunks: ranges.length,
      reason: "ok" as const,
    };
  });

export const processDraftChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ jobId: z.string().uuid(), chunkIndex: z.number().int().min(0) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const job = await loadDraftJobDoc(supabase, data.jobId, userId);
    const ranges = (job.chunk_ranges as unknown as Array<[number, number]>) ?? [];
    if (data.chunkIndex >= ranges.length)
      throw new Error(`Chunk ${data.chunkIndex} out of range (total ${ranges.length})`);

    // Idempotency guard — if this chunk is already recorded, return current
    // counters without re-invoking the AI. Two parallel drivers (client loop
    // + server tick) both try to work the same job.
    const priorIndices = ((job as { processed_indices?: number[] | null })
      .processed_indices ?? []) as number[];
    if (priorIndices.includes(data.chunkIndex)) {
      return {
        processed: (job.processed_chunks as number) ?? priorIndices.length,
        total: ranges.length,
        itemsAdded: 0,
        failuresAdded: [] as string[],
        skipped: true as const,
      };
    }

    const [start, end] = ranges[data.chunkIndex];
    const { data: doc } = await supabase
      .from("nectar_documents")
      .select("raw_text")
      .eq("id", job.document_id as string)
      .maybeSingle();
    if (!doc) {
      // Source document was deleted out from under this job — mark failed so
      // the driver stops retrying instead of looping forever.
      await supabase
        .from("nectar_draft_jobs")
        .update({
          status: "failed",
          error_message: "Source document was deleted; draft job cancelled.",
        })
        .eq("id", data.jobId);
      return {
        processed: (job.processed_chunks as number) ?? priorIndices.length,
        total: ranges.length,
        itemsAdded: 0,
        failuresAdded: [] as string[],
        skipped: true as const,
        aborted: true as const,
      };
    }
    const rawText = ((doc?.raw_text as string | null) ?? "").trim();
    const window = rawText.slice(start, end);

    const t0 = Date.now();
    let items: DraftItem[] = [];
    let failures: string[] = [];
    // Per-chunk attempt cap: bump BEFORE the AI call and gave-up if we already
    // exceeded the limit on a prior invocation. Must stay in sync with
    // MAX_CHUNK_ATTEMPTS in nectar-draft-tick.server.ts.
    const MAX_CHUNK_ATTEMPTS = 2;
    let attemptsSoFar = 1;
    try {
      const { data: attemptCount } = await supabase.rpc("nectar_bump_chunk_attempt", {
        p_job: data.jobId,
        p_index: data.chunkIndex,
      });
      attemptsSoFar = Number(attemptCount ?? 1);
    } catch {
      // Best-effort — proceed even if the counter fails.
    }
    // Heartbeat: record that we're kicking off an AI call so a DB observer
    // (or the UI) can see the difference between "silently 429-looping" and
    // "AI call genuinely in-flight". Best-effort; ignore errors.
    await supabase
      .rpc("nectar_bump_draft_attempt", { p_job: data.jobId })
      .then(() => undefined, () => undefined);
    try {
      const got = await extractChunkWithRetry(
        window,
        `PART ${data.chunkIndex + 1} OF ${ranges.length}`,
      );
      items = got.items;
      failures = got.failures;
    } catch (err) {
      const rawRetryAfterMs = (err as { retryAfterMs?: unknown })?.retryAfterMs;
      const retryAfterMs =
        typeof rawRetryAfterMs === "number" && Number.isFinite(rawRetryAfterMs)
          ? Math.max(5_000, Math.min(120_000, rawRetryAfterMs))
          : isTransientAIError(err) ||
              /rate[-\s]?limit|throttl|temporar|timeout|timed out|429|503|502|504/i.test(
                typeof err === "string" ? err : ((err as Error | undefined)?.message ?? ""),
              )
            ? 30_000
            : null;
      if (retryAfterMs !== null) {
        // Record the transient hit so we can see rate-limit pressure in the DB.
        const msg = (err as Error | undefined)?.message ?? "transient AI error";
        await supabase
          .rpc("nectar_bump_draft_transient", { p_job: data.jobId, p_msg: msg })
          .then(() => undefined, () => undefined);
        if (attemptsSoFar >= MAX_CHUNK_ATTEMPTS) {
          // Enough — record as failure and advance instead of retrying forever.
          failures = [
            `PART ${data.chunkIndex + 1}: gave up after ${attemptsSoFar} attempts (last error: ${msg.slice(0, 200)})`,
          ];
        } else {
          // Do NOT throw — throwing from a server fn logs as a runtime error
          // and can trigger the route error boundary. Return a soft transient
          // status; the client driver retries this same section after a pause.
          return {
            processed: (job.processed_chunks as number) ?? priorIndices.length,
            total: ranges.length,
            itemsAdded: 0,
            failuresAdded: [] as string[],
            skipped: true as const,
            transient: true as const,
            retryAfterMs,
          };
        }
      } else {
        failures = [
          `PART ${data.chunkIndex + 1}: ${(err as Error).message.slice(0, 300)}`,
        ];
      }
    }

    const durationMs = Math.max(1, Date.now() - t0);

    const priorItems = (job.extracted_items as unknown as DraftItem[]) ?? [];
    const priorFailures = (job.chunk_failures as unknown as string[]) ?? [];
    const priorDurations = ((job as { chunk_durations_ms?: number[] | null })
      .chunk_durations_ms ?? []) as number[];
    const nextProcessed = (job.processed_chunks as number) + 1;

    const { error: updErr } = await supabase
      .from("nectar_draft_jobs")
      .update({
        processed_chunks: nextProcessed,
        processed_indices: [...priorIndices, data.chunkIndex],
        chunk_durations_ms: [...priorDurations, durationMs],
        extracted_items: [...priorItems, ...items] as unknown as Json,
        chunk_failures: [...priorFailures, ...failures] as unknown as Json,
      })
      .eq("id", data.jobId);
    if (updErr) throw new Error(`Failed to persist chunk result: ${updErr.message}`);

    return {
      processed: nextProcessed,
      total: ranges.length,
      itemsAdded: items.length,
      failuresAdded: failures,
      skipped: false as const,
    };
  });

// Lists active (extracting) draft jobs for the caller's org so the global
// driver can pick them up on mount and resume. Includes the timing metadata
// the driver needs to compute a real ETA.
export const getActiveDraftJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ organizationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const { data: rows, error } = await supabase
      .from("nectar_draft_jobs")
      .select(
        "id, document_id, status, total_chunks, processed_chunks, processed_indices, started_at, chunk_durations_ms",
      )
      .eq("organization_id", data.organizationId)
      .eq("status", "extracting")
      .order("started_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    const docIds = Array.from(
      new Set((rows ?? []).map((r) => r.document_id as string)),
    );
    const titles = new Map<string, string>();
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from("nectar_documents")
        .select("id, title, file_name")
        .in("id", docIds);
      for (const d of docs ?? []) {
        titles.set(
          d.id as string,
          ((d.title as string | null) ?? (d.file_name as string | null) ?? "Untitled") as string,
        );
      }
    }

    return {
      jobs: (rows ?? []).map((r) => ({
        jobId: r.id as string,
        documentId: r.document_id as string,
        documentTitle: titles.get(r.document_id as string) ?? "Untitled",
        totalChunks: (r.total_chunks as number) ?? 0,
        processedChunks: (r.processed_chunks as number) ?? 0,
        processedIndices: (r.processed_indices as number[] | null) ?? [],
        startedAt: r.started_at as string,
        chunkDurationsMs: (r.chunk_durations_ms as number[] | null) ?? [],
      })),
    };
  });

// Fire a server-side background tick for an active job. Thin authenticated
// wrapper around fireDraftTick() so the client can nudge the server to keep
// chunking when the tab is hidden or about to close. Idempotency in
// processDraftChunk / persistChunkResult makes overlap with the client
// driver a no-op.
export const nudgeDraftJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Auth: only members of the job's org can nudge it.
    await loadDraftJobDoc(supabase, data.jobId, userId);
    try {
      const { fireDraftTick } = await import("./nectar-draft-tick.server");
      await fireDraftTick(data.jobId, { wait: false });
    } catch (err) {
      // Best-effort; the client driver is authoritative.
      console.warn("[nudgeDraftJob] fireDraftTick failed", (err as Error).message);
    }
    return { ok: true as const };
  });

export const finalizeRequirementsDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const job = await loadDraftJobDoc(supabase, data.jobId, userId);
    const items = (job.extracted_items as unknown as DraftItem[]) ?? [];
    const chunkFailures = (job.chunk_failures as unknown as string[]) ?? [];
    const chunkCount = job.total_chunks as number;
    const processedCount = (job.processed_chunks as number) ?? 0;

    if (processedCount < chunkCount) {
      throw new Error(
        `NECTAR is still reading this document (${processedCount} of ${chunkCount} sections complete). It will continue automatically.`,
      );
    }

    const { data: doc, error: docErr } = await supabase
      .from("nectar_documents")
      .select(
        "id, organization_id, title, authoritative_kind, file_name, source, external_ids, assisted_setup_requested, raw_text",
      )
      .eq("id", job.document_id as string)
      .maybeSingle();
    if (docErr) {
      console.error("[finalizeRequirementsDraft] doc fetch error", {
        jobId: data.jobId,
        documentId: job.document_id,
        code: docErr.code,
        message: docErr.message,
        details: docErr.details,
      });
      throw new Error(`Draft job's document could not be loaded: ${docErr.message}`);
    }
    if (!doc) {
      await supabase
        .from("nectar_draft_jobs")
        .update({
          status: "failed",
          error_message: "Source document was deleted; draft job cancelled.",
        })
        .eq("id", data.jobId);
      console.error("[finalizeRequirementsDraft] doc missing", {
        jobId: data.jobId,
        documentId: job.document_id,
        orgId: job.organization_id,
        userId,
      });
      throw new Error("Draft job's source document was deleted; the job has been cancelled.");
    }
    const rawText = ((doc.raw_text as string | null) ?? "").trim();

    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", doc.organization_id as string)
      .maybeSingle();
    const orgName = (orgRow?.name as string | null) ?? null;

    // Dedupe against existing requirements for this source. Seed the set
    // from titles (normalized) so pre-existing rows written under older key
    // formulas still block re-inserts of the same normalized clause.
    const { data: existing } = await supabase
      .from("nectar_requirements")
      .select("title")
      .eq("organization_id", doc.organization_id as string)
      .eq("source_document_id", doc.id as string)
      .neq("review_status", "removed");
    const kind = (doc.authoritative_kind as string) ?? "src";
    const existingKeys = new Set(
      (existing ?? [])
        .map((r) => buildRequirementDedupKey(kind, (r.title as string | null) ?? ""))
        .filter((k) => k.length > 0),
    );

    const ext = (doc.external_ids ?? {}) as {
      source_url?: string;
      captured_at?: string;
    };
    const isWeb = (doc.source as string | null) === "web" && !!ext.source_url;
    const webSuffix = isWeb
      ? ` (per ${ext.source_url}${
          ext.captured_at ? `, captured ${ext.captured_at.slice(0, 10)}` : ""
        })`
      : "";
    const baseLabel = (doc.title as string) ?? "Source";
    const assisted =
      (doc.assisted_setup_requested as boolean | null) === true;

    type AiRow = {
      organization_id: string;
      source_document_id: string;
      origin: "document";
      requirement_key: string;
      title: string;
      description: string | null;
      category: "audit_doc" | "obligation" | "rule" | "billing";
      source_citation: string;
      applies_to: "company" | "staff" | "client";
      approval_state: string | null;
    };
    const rows: Array<{ row: AiRow; key: string }> = [];
    for (const item of items) {
      const titleClean = item.title.trim().slice(0, 200);
      if (!titleClean) continue;
      // Dedup by normalized title + source document (see initial-draft path).
      const key = buildRequirementDedupKey(kind, titleClean);
      if (!key) continue;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const citation = item.citation
        ? `${baseLabel} — ${item.citation}${webSuffix}`
        : `${baseLabel}${webSuffix}`;
      rows.push({
        key,
        row: {
          organization_id: doc.organization_id as string,
          source_document_id: doc.id as string,
          origin: "document",
          requirement_key: key,
          title: titleClean,
          description: item.description ?? null,
          category: item.category ?? "obligation",
          source_citation: citation,
          applies_to: item.applies_to ?? "company",
          approval_state: assisted ? "nectar_drafted" : null,
        },
      });
    }

    let inserted = 0;
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { data: ins, error } = await supabase
        .from("nectar_requirements")
        .insert(slice.map((s) => s.row))
        .select("id");
      if (error) throw new Error(`Requirement insert failed: ${error.message}`);
      inserted += ins?.length ?? 0;
      if (assisted && ins) {
        for (const r of ins) {
          await markDraftedByNectar({
            organizationId: doc.organization_id as string,
            requirementId: r.id as string,
          });
        }
      }
    }

    // Fire-and-forget HIVE tickets for unmapped requirements / unknown codes.
    // Serialized on purpose (helper handles its own errors).
    const KNOWN_REQ_CATEGORIES = new Set([
      "audit_doc",
      "obligation",
      "rule",
      "billing",
    ]);
    for (const item of items) {
      const titleClean = item.title.trim().slice(0, 200);
      if (!titleClean) continue;
      const cat = (item.category ?? "").toString();
      if (cat && KNOWN_REQ_CATEGORIES.has(cat)) continue;
      const reqKey = `${(doc.authoritative_kind as string) ?? "src"}:ai:${titleClean}:${item.citation ?? ""}`
        .toLowerCase()
        .slice(0, 120);
      await reportPlatformEvent({
        eventKind: "requirement_unmapped",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Unmapped requirement — "${titleClean.slice(0, 120)}"`,
        detail: `NECTAR extracted a requirement from document ${doc.id} ("${(doc.title as string) ?? doc.file_name}") but could not map it to a known HIVE category bucket. Extracted title: "${titleClean}". Citation: ${item.citation ?? "(none)"}. Applies to: ${item.applies_to ?? "(unset)"}.`,
        category: "mapping_gap",
        severity: "low",
        dedupeKey: `requirement_unmapped:${doc.id}:${reqKey}`,
        eventRef: {
          documentId: doc.id,
          requirementKey: reqKey,
          extractedTitle: titleClean,
        },
      });
    }

    // Unknown-code scan across the raw text (moved verbatim from the old
    // monolithic handler so ticket coverage doesn't regress).
    const knownCodes = new Set(EVV_SERVICE_CODES.map((c) => c.code));
    const codeCandidates = new Set<string>();
    const codeRegexes: RegExp[] = [
      /\bcodes?\s+([A-Z]{2,4}\d?)\b/g,
      /\bservice\s+codes?\s+([A-Z]{2,4}\d?)\b/g,
      /\(([A-Z]{2,4}\d?)\)/g,
      /\b([A-Z]{2,4}\d?)\s*[-—–]\s*[A-Z][a-z]/g,
    ];
    for (const rx of codeRegexes) {
      let m: RegExpExecArray | null;
      while ((m = rx.exec(rawText)) !== null) {
        const tok = m[1];
        if (!tok) continue;
        if (knownCodes.has(tok)) continue;
        if (
          /^(THE|AND|FOR|ALL|NOT|YOU|ARE|WAS|WITH|FROM|HAS|HAD|USA|LLC|INC|CFR|USC|DSP|DHS|DHHS|DSPD|SOW|PDF|PCSP|HCBS|EVV|UPI|UEVV)$/.test(
            tok,
          )
        )
          continue;
        codeCandidates.add(tok);
      }
    }
    for (const code of codeCandidates) {
      const snippetMatch = rawText.match(
        new RegExp(`.{0,80}\\b${code}\\b.{0,80}`),
      );
      const snippet = snippetMatch ? snippetMatch[0].replace(/\s+/g, " ").trim() : null;
      await reportPlatformEvent({
        eventKind: "unknown_code_structure",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Unknown code/structure "${code}" — no HIVE template`,
        detail: `Authoritative source ${doc.id} ("${(doc.title as string) ?? doc.file_name}") references "${code}", which is not in HIVE's known service-code registry.${snippet ? ` Context: "${snippet.slice(0, 280)}"` : ""}`,
        category: "expansion_need",
        severity: "low",
        dedupeKey: `unknown_code_structure:${code}`,
        eventRef: { documentId: doc.id, unknownCode: code, contextSnippet: snippet },
      });
    }

    // Mark job done.
    await supabase
      .from("nectar_draft_jobs")
      .update({
        status: "done",
        inserted_count: inserted,
      })
      .eq("id", data.jobId);

    if (inserted === 0) {
      if (chunkFailures.length > 0) {
        await reportPlatformEvent({
          eventKind: "ai_error",
          organizationId: doc.organization_id as string,
          organizationName: orgName,
          title: `Extractor couldn't finish "${(doc.title as string) ?? doc.file_name}"`,
          detail: `Document ${doc.id} was split into ${chunkCount} sections; ${chunkFailures.length} failed to parse and yielded 0 requirements. First failure: ${chunkFailures[0]?.slice(0, 300)}`,
          category: "parsing_failure",
          severity: "medium",
          dedupeKey: `extractor_incomplete:${doc.id}`,
          eventRef: { documentId: doc.id, chunkCount, failedChunks: chunkFailures.length },
        });
        return {
          inserted: 0,
          chunkCount,
          chunkFailures,
          reason: "extractor_incomplete" as const,
          message: `NECTAR couldn't finish reading this document — ${chunkFailures.length} of ${chunkCount} sections failed to parse. First failure: ${chunkFailures[0]?.slice(0, 200) ?? "(unknown)"}. Click Draft again to retry.`,
        };
      }
      await reportPlatformEvent({
        eventKind: "no_requirements_found",
        organizationId: doc.organization_id as string,
        organizationName: orgName,
        title: `Extractor returned 0 requirements from "${(doc.title as string) ?? doc.file_name}"`,
        detail: `Document ${doc.id} parsed cleanly but produced no drafted requirements.`,
        category: "parsing_failure",
        severity: "low",
        dedupeKey: `no_requirements:${doc.id}`,
        eventRef: { documentId: doc.id },
      });
      return {
        inserted: 0,
        chunkCount,
        chunkFailures,
        reason: "no_requirements" as const,
        message:
          "NECTAR read the document but didn't find clear requirement language. You can add them by hand from the Requirements tab.",
      };
    }

    if (chunkFailures.length > 0) {
      return {
        inserted,
        chunkCount,
        chunkFailures,
        reason: "partial" as const,
        message: `Drafted ${inserted} requirements. ${chunkFailures.length} of ${chunkCount} sections couldn't be read on this pass (first failure: ${chunkFailures[0]?.slice(0, 200) ?? "unknown"}). Click Draft again to retry those sections.`,
      };
    }

    return { inserted, chunkCount, chunkFailures: [] as string[], reason: "ok" as const };
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
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
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


export const explainRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ requirementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: req, error } = await supabase
      .from("nectar_requirements")
      .select(
        "id, title, description, category, source_citation, source_document_id",
      )
      .eq("id", data.requirementId)
      .single();
    if (error || !req) throw new Error(error?.message ?? "Requirement not found");

    let sourceTitle: string | null = null;
    if (req.source_document_id) {
      const { data: doc } = await supabase
        .from("nectar_documents")
        .select("title, file_name")
        .eq("id", req.source_document_id)
        .single();
      sourceTitle =
        (doc?.title as string | null) ?? (doc?.file_name as string | null) ?? null;
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const userBody = `SOURCE DOCUMENT: ${sourceTitle ?? "—"}
CITATION: ${req.source_citation ?? "—"}
REQUIREMENT TITLE: ${req.title}
REQUIREMENT TEXT: ${req.description ?? "(no extended text — restate the title only)"}`;

    const res = await gatewayFetch({
        model: "bedrock",
        messages: [
          { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
          { role: "user", content: userBody },
        ],
        response_format: { type: "json_object" },
      });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
    const json = await res.json();
    let raw: unknown = {};
    try {
      raw = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      raw = {};
    }
    const parsed = ExplainResp.safeParse(raw);
    const explanation = parsed.success
      ? parsed.data
      : {
          plain_language:
            "NECTAR couldn't produce a confident plain-language restatement of this requirement. Please read the original source text.",
          key_terms: [] as Array<{ term: string; plain: string }>,
          confidence: "low" as const,
          caveat: "Defer to the original source wording.",
        };

    return {
      explanation,
      disclaimer:
        "This is a NECTAR plain-language restatement to aid your understanding. It is NOT legal, compliance, or audit advice, and does NOT replace the original source text. Always review the original requirement and consult counsel as needed before acting.",
    };
  });
