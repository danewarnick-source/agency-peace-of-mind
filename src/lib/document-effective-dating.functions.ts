/**
 * Document effective-dating + replacement flow.
 *
 * Provider-owns-it model: HIVE surfaces and prompts; the provider confirms
 * dates and is responsible for keeping documents current. NECTAR date
 * detection is stubbed in pass 1 — the flow always falls through to the
 * provider-entered prompt. Real extraction lands in a later pass.
 *
 * Supports three document surfaces uniformly:
 *   - "client"   → public.client_documents
 *   - "employee" → public.employee_documents
 *   - "nectar"   → public.nectar_documents (org / authoritative sources)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

export type DocKind = "client" | "employee" | "nectar";

const TABLE: Record<DocKind, string> = {
  client: "client_documents",
  employee: "employee_documents",
  nectar: "nectar_documents",
};

// Column that identifies the "type" of a document per surface — used to find
// an existing current sibling of the same type.
const TYPE_COL: Record<DocKind, string> = {
  client: "document_type",
  employee: "kind",
  nectar: "document_type",
};

// Subject columns per surface (client_id / staff_id / owner+client+staff).
type SubjectFilter = { clientId?: string | null; staffId?: string | null };

function applySubjectFilter<T extends { eq: (col: string, val: string) => T }>(
  q: T,
  kind: DocKind,
  subject: SubjectFilter,
): T {
  if (kind === "client" && subject.clientId) return q.eq("client_id", subject.clientId);
  if (kind === "employee" && subject.staffId) return q.eq("staff_id", subject.staffId);
  if (kind === "nectar") {
    if (subject.clientId) return q.eq("client_id", subject.clientId);
    if (subject.staffId) return q.eq("staff_id", subject.staffId);
  }
  return q;
}

const kindSchema = z.enum(["client", "employee", "nectar"]);
const modeSchema = z.enum(["fixed_date", "ongoing", "until_replaced"]);
const dateSourceSchema = z.enum(["from_document", "provider_entered"]);

// ---------------------------------------------------------------------------
// DETECT — real NECTAR extraction via the detect-doc-dates edge function.
// Provider still owns the final dates: this returns candidates + a source
// snippet + confidence and never mutates the document. If nothing is
// confidently found, returns detected:false so the provider-entry path runs.
// ---------------------------------------------------------------------------
export const detectEffectiveDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      document_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    const empty = {
      detected: false as const,
      effective_from: null as string | null,
      effective_to: null as string | null,
      effective_to_mode: null as string | null,
      confidence: "low" as "low" | "medium" | "high",
      source_snippet: null as string | null,
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: fnRes, error } = await sb.functions.invoke("detect-doc-dates", {
        body: {
          kind: data.kind,
          document_id: data.document_id,
          organization_id: data.organization_id,
        },
      });
      if (error || !fnRes || fnRes.detected !== true) return empty;
      return {
        detected: true as const,
        effective_from: (fnRes.effective_from as string | null) ?? null,
        effective_to: (fnRes.effective_to as string | null) ?? null,
        effective_to_mode: (fnRes.effective_to_mode as string | null) ?? null,
        confidence: ((fnRes.confidence as string | null) ?? "medium") as "low" | "medium" | "high",
        source_snippet: (fnRes.source_snippet as string | null) ?? null,
      };
    } catch {
      return empty;
    }
  });

// ---------------------------------------------------------------------------
// FIND CURRENT SIBLING — used to prompt "Is this replacing the current X?"
// Returns the newest current doc of the same type on the same subject,
// EXCLUDING the newly uploaded doc.
// ---------------------------------------------------------------------------
export type CurrentSibling = {
  id: string;
  file_name: string | null;
  effective_from: string | null;
  effective_to: string | null;
  effective_to_mode: string | null;
};

export const findCurrentSibling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      document_type: z.string().min(1),
      exclude_document_id: z.string().uuid(),
      client_id: z.string().uuid().nullable().optional(),
      staff_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ sibling: CurrentSibling | null }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let q = sb
      .from(TABLE[data.kind])
      .select("id, file_name, effective_from, effective_to, effective_to_mode, uploaded_at, created_at")
      .eq("organization_id", data.organization_id)
      .eq(TYPE_COL[data.kind], data.document_type)
      .eq("status", "current")
      .neq("id", data.exclude_document_id)
      .limit(1);
    q = applySubjectFilter(q, data.kind, { clientId: data.client_id ?? null, staffId: data.staff_id ?? null });
    const orderCol = data.kind === "employee" ? "uploaded_at" : (data.kind === "nectar" ? "created_at" : "uploaded_at");
    q = q.order(orderCol, { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const row = (rows?.[0] as Record<string, unknown> | undefined) ?? null;
    if (!row) return { sibling: null };
    return {
      sibling: {
        id: String(row.id),
        file_name: (row.file_name as string | null) ?? null,
        effective_from: (row.effective_from as string | null) ?? null,
        effective_to: (row.effective_to as string | null) ?? null,
        effective_to_mode: (row.effective_to_mode as string | null) ?? null,
      },
    };
  });

// ---------------------------------------------------------------------------
// SET EFFECTIVE DATES — provider confirms/enters dates on a document.
// ---------------------------------------------------------------------------
export const setEffectiveDates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      document_id: z.string().uuid(),
      effective_from: z.string().min(1), // YYYY-MM-DD
      effective_to_mode: modeSchema,
      effective_to: z.string().nullable().optional(), // required when fixed_date
      date_source: dateSourceSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    if (data.effective_to_mode === "fixed_date" && !data.effective_to) {
      throw new Error("Effective-to date is required when mode is 'fixed date'.");
    }
    const patch: Record<string, unknown> = {
      effective_from: data.effective_from,
      effective_to_mode: data.effective_to_mode,
      effective_to: data.effective_to_mode === "fixed_date" ? data.effective_to : null,
      date_source: data.date_source,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb
      .from(TABLE[data.kind])
      .update(patch)
      .eq("id", data.document_id)
      .eq("organization_id", data.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// REPLACE DOCUMENT — mark old outdated, close its open-ended range, link
// superseded_by → new. New doc's effective_from should already be set via
// setEffectiveDates before calling this.
// ---------------------------------------------------------------------------
export const replaceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      old_document_id: z.string().uuid(),
      new_document_id: z.string().uuid(),
      new_effective_from: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Load the old doc to decide whether to auto-close its effective_to.
    const { data: oldDoc, error: loadErr } = await sb
      .from(TABLE[data.kind])
      .select("id, effective_to, effective_to_mode")
      .eq("id", data.old_document_id)
      .eq("organization_id", data.organization_id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!oldDoc) throw new Error("Old document not found.");

    // Auto-close: if the old doc had an open-ended mode, set its effective_to
    // to the day before the new doc's effective_from so the timeline has no
    // gap or overlap.
    const openEnded = oldDoc.effective_to_mode === "ongoing" || oldDoc.effective_to_mode === "until_replaced";
    let closedTo: string | null = oldDoc.effective_to ?? null;
    if (openEnded) {
      const d = new Date(data.new_effective_from + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      closedTo = d.toISOString().slice(0, 10);
    }
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: "outdated",
      superseded_by: data.new_document_id,
      superseded_at: nowIso,
      effective_to_mode: openEnded ? "fixed_date" : oldDoc.effective_to_mode,
      effective_to: closedTo,
    };
    const { error: upErr } = await sb
      .from(TABLE[data.kind])
      .update(patch)
      .eq("id", data.old_document_id)
      .eq("organization_id", data.organization_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true as const, auto_closed_to: openEnded ? closedTo : null };
  });

// ---------------------------------------------------------------------------
// LIST OUTDATED — retained versions for a subject (client / employee) or org
// (nectar). Used by the "Outdated / Superseded" sections in three places.
// ---------------------------------------------------------------------------
export const listOutdatedDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      organization_id: z.string().uuid(),
      kind: kindSchema,
      client_id: z.string().uuid().nullable().optional(),
      staff_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ documents: OutdatedDocument[] }> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const nameCol = data.kind === "employee" ? "file_name, title" : "file_name";
    const typeCol = TYPE_COL[data.kind];
    let q = sb
      .from(TABLE[data.kind])
      .select(
        `id, ${nameCol}, ${typeCol}, effective_from, effective_to, effective_to_mode, superseded_by, superseded_at`,
      )
      .eq("organization_id", data.organization_id)
      .eq("status", "outdated")
      .order("superseded_at", { ascending: false })
      .limit(200);
    q = applySubjectFilter(q, data.kind, {
      clientId: data.client_id ?? null,
      staffId: data.staff_id ?? null,
    });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const out: OutdatedDocument[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      file_name: (r.file_name as string | null) ?? null,
      title: (r.title as string | null) ?? null,
      document_type: (r[typeCol] as string | null) ?? null,
      effective_from: (r.effective_from as string | null) ?? null,
      effective_to: (r.effective_to as string | null) ?? null,
      effective_to_mode: (r.effective_to_mode as string | null) ?? null,
      superseded_by: (r.superseded_by as string | null) ?? null,
      superseded_at: (r.superseded_at as string | null) ?? null,
    }));
    return { documents: out };
  });

export type OutdatedDocument = {
  id: string;
  file_name: string | null;
  title: string | null;
  document_type: string | null;
  effective_from: string | null;
  effective_to: string | null;
  effective_to_mode: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
};

