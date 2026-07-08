/**
 * Point-in-time document reads (pass 3).
 *
 * `getEffectiveDocument` returns whichever version of a document — client
 * PCSP, employee cert, org authoritative source — governed on a given date.
 * As-of-now reads (asOfDate="now" or omitted) return the current version.
 * As-of-date reads return the version whose effective range contains the
 * date, using the effective_from / effective_to / effective_to_mode stored
 * in pass 1 (and legacy effective_start/effective_end for older nectar rows).
 *
 * Gap handling: if no version covered that date, returns document=null so
 * the caller can surface "no governing source on file for [date]".
 *
 * This is a READ helper — nothing here mutates document state. It reads the
 * dates the provider already confirmed and picks the right row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  resolveEffectiveDocument,
  toGoverningSource,
  type DocEffectiveRange,
  type GoverningSource,
} from "@/lib/effective-document";

const kindSchema = z.enum(["client", "employee", "nectar"]);

const TABLE = {
  client: "client_documents",
  employee: "employee_documents",
  nectar: "nectar_documents",
} as const;

const TYPE_COL = {
  client: "document_type",
  employee: "kind",
  nectar: "document_type",
} as const;

/**
 * Resolve the effective document version for a (kind, subject, docType,
 * asOfDate) tuple. Never falls back across time modes — a "now" caller
 * that expected the current version will not silently get a historical
 * one, and vice versa.
 */
export const getEffectiveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      document_type: z.string().min(1),
      client_id: z.string().uuid().nullable().optional(),
      staff_id: z.string().uuid().nullable().optional(),
      authoritative_kind: z.string().nullable().optional(),
      // "now" or YYYY-MM-DD. Callers MUST pass this — no implicit default —
      // to keep as-of-now vs. as-of-date reads explicit in the code.
      as_of: z.union([z.literal("now"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const selectCols =
      data.kind === "nectar"
        ? "id, title, file_name, document_type, authoritative_kind, status, effective_from, effective_to, effective_to_mode, effective_start, effective_end, superseded_by, created_at, is_current"
        : data.kind === "employee"
          ? "id, title, file_name, kind, status, effective_from, effective_to, effective_to_mode, superseded_by, created_at"
          : "id, file_name, document_type, status, effective_from, effective_to, effective_to_mode, superseded_by, uploaded_at";

    let q = sb
      .from(TABLE[data.kind])
      .select(selectCols)
      .eq("organization_id", data.organization_id)
      .eq(TYPE_COL[data.kind], data.document_type);

    if (data.kind === "client" && data.client_id) q = q.eq("client_id", data.client_id);
    if (data.kind === "employee" && data.staff_id) q = q.eq("staff_id", data.staff_id);
    if (data.kind === "nectar") {
      if (data.client_id) q = q.eq("client_id", data.client_id);
      if (data.staff_id) q = q.eq("staff_id", data.staff_id);
      if (data.authoritative_kind) q = q.eq("authoritative_kind", data.authoritative_kind);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const candidates = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      // Normalize legacy fields so the pure resolver can read them.
      created_at: (r.created_at ?? r.uploaded_at ?? null) as string | null,
    })) as unknown as Array<DocEffectiveRange & Record<string, unknown>>;

    const picked = resolveEffectiveDocument(candidates, data.as_of);
    return {
      document: (picked as unknown as Record<string, unknown> | null) ?? null,
      governingSource: toGoverningSource(picked ?? null, data.document_type),
    };
  });

/**
 * Bulk variant used by the compliance engine: for a set of source-document
 * ids on nectar_documents, return which ones were effective on `asOf`.
 * A requirement/rule whose source was NOT effective on that date should
 * not enforce for an event on that date.
 */
export const filterSourcesEffectiveOn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      source_document_ids: z.array(z.string().uuid()).min(1),
      as_of: z.union([z.literal("now"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{
    effective_ids: string[];
    governing_by_id: Record<string, GoverningSource>;
  }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: rows, error } = await sb
      .from("nectar_documents")
      .select(
        "id, title, file_name, document_type, authoritative_kind, status, effective_from, effective_to, effective_to_mode, effective_start, effective_end, created_at",
      )
      .eq("organization_id", data.organization_id)
      .in("id", data.source_document_ids);
    if (error) throw new Error(error.message);

    const iso = data.as_of === "now" ? null : data.as_of;
    const effectiveIds: string[] = [];
    const governing: Record<string, GoverningSource> = {};
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const picked = resolveEffectiveDocument(
        [r as unknown as DocEffectiveRange],
        iso ?? "now",
      );
      // resolveEffectiveDocument on a single row returns it if effective
      // (or the row itself when asOf==="now" and status current-or-newest);
      // for "now" mode we further require the row to actually be current.
      const isEffective =
        iso === null
          ? (r as Record<string, unknown>).status === "current"
          : picked !== null;
      if (isEffective) {
        const id = String((r as Record<string, unknown>).id);
        effectiveIds.push(id);
        governing[id] = toGoverningSource(picked ?? (r as unknown as DocEffectiveRange));
      }
    }
    return { effective_ids: effectiveIds, governing_by_id: governing };
  });
