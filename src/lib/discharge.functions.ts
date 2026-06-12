/**
 * CRM Phase C3 — Client discharge flow.
 *
 * The discharge STEPS COME FROM THE SOW already in NECTAR's authoritative
 * sources (DHHS91172 §1.22 "Person's Discharge Procedure"). We never invent
 * or hardcode the steps — `getSowDischargeProcedure` slices the section out
 * of the parsed authoritative document(s) at request time. If the section
 * anchor isn't found, we return `found:false` and the UI refuses to discharge.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const orgOnly = z.object({ organization_id: z.string().uuid() });

const SECTION_NUM = "1.22"; // §1.22 Person's Discharge Procedure
const SECTION_TITLE = "Person's Discharge Procedure";
const SECTION_ANCHOR_RE = /1\.22\s*[\.\s]?\s*Person['’]s\s+Discharge\s+Procedure/i;
// Stops at the next "1.NN " heading we see (1.23, 1.24, ...). Be conservative
// so we don't truncate inside the section.
const SECTION_STOP_RE = /\b1\.(2[3-9]|[3-9]\d)\b\s+[A-Z]/;

export type SowDischargeProcedure = {
  found: true;
  source_document_id: string;
  source_title: string;
  source_kind: string;
  source_citation: string; // e.g. "DHHS91172 §1.22 Person's Discharge Procedure"
  full_section_text: string;
  subsections: {
    summary_any: string | null;        // (a) — always required
    residential_additions: string | null; // (b) — HHS/RHS/PPS/SLQ only
    contractor_initiated: string | null;  // (c)
    person_initiated: string | null;      // (d)
  };
} | {
  found: false;
  reason: string;
  searched_documents: Array<{ id: string; title: string; kind: string | null }>;
};

function sliceSection(text: string): { start: number; end: number; section: string } | null {
  const m = text.match(SECTION_ANCHOR_RE);
  if (!m || m.index == null) return null;
  const start = m.index;
  const rest = text.slice(start);
  const stopMatch = rest.slice(m[0].length).search(SECTION_STOP_RE);
  const end =
    stopMatch >= 0 ? start + m[0].length + stopMatch : Math.min(text.length, start + 8000);
  return { start, end, section: text.slice(start, end).trim() };
}

function sliceSubsection(section: string, marker: RegExp, nextMarkers: RegExp[]): string | null {
  const m = section.match(marker);
  if (!m || m.index == null) return null;
  const start = m.index;
  const rest = section.slice(start + m[0].length);
  let endRel = rest.length;
  for (const re of nextMarkers) {
    const nm = rest.search(re);
    if (nm >= 0 && nm < endRel) endRel = nm;
  }
  return (m[0] + rest.slice(0, endRel)).trim();
}

export const getSowDischargeProcedure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgOnly.parse(d))
  .handler(async ({ data, context }): Promise<SowDischargeProcedure> => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    // Pull authoritative sources visible to this org. RLS already scopes to the org.
    const { data: docs, error } = await supabase
      .from("nectar_documents")
      .select("id, title, authoritative_kind, is_authoritative_source, raw_text, parse_status")
      .eq("organization_id", data.organization_id)
      .eq("is_authoritative_source", true)
      .in("authoritative_kind", ["state_sow", "provider_contract"])
      .eq("parse_status", "parsed");

    if (error) throw new Error(error.message);

    const searched = (docs ?? []).map((d) => ({
      id: d.id as string,
      title: (d.title as string | null) ?? "(untitled)",
      kind: (d.authoritative_kind as string | null) ?? null,
    }));

    // Prefer state_sow over provider_contract so the canonical state language
    // wins when both are present.
    const ordered = [...(docs ?? [])].sort((a, b) => {
      const ak = a.authoritative_kind === "state_sow" ? 0 : 1;
      const bk = b.authoritative_kind === "state_sow" ? 0 : 1;
      return ak - bk;
    });

    for (const doc of ordered) {
      const raw = (doc.raw_text as string | null) ?? "";
      if (!raw) continue;
      const sliced = sliceSection(raw);
      if (!sliced) continue;

      const section = sliced.section;

      // Subsections within §1.22. (a)/(b)/(c)/(d) are the SOW's own bullets;
      // we slice each to the next marker so the verbatim text from the SOW
      // is what the provider sees and what we store on the audit row.
      const A = sliceSubsection(section, /\(a\)\s+When a Person is discharged/i, [
        /\(b\)\s+/i, /\(c\)\s+If the Contractor/i, /\(d\)\s+The Person/i,
      ]);
      const B = sliceSubsection(section, /\(b\)\s+/i, [
        /\(c\)\s+If the Contractor/i, /\(d\)\s+The Person/i,
      ]);
      const C = sliceSubsection(section, /\(c\)\s+If the Contractor is initiating/i, [
        /\(d\)\s+The Person/i,
      ]);
      const D = sliceSubsection(section, /\(d\)\s+The Person may choose to discharge/i, []);

      return {
        found: true,
        source_document_id: doc.id as string,
        source_title: (doc.title as string | null) ?? "Scope of Work",
        source_kind: (doc.authoritative_kind as string | null) ?? "state_sow",
        source_citation: `${(doc.title as string | null) ?? "Scope of Work"} §${SECTION_NUM} ${SECTION_TITLE}`,
        full_section_text: section,
        subsections: {
          summary_any: A,
          residential_additions: B,
          contractor_initiated: C,
          person_initiated: D,
        },
      };
    }

    return {
      found: false,
      reason:
        "Discharge section (§1.22 Person's Discharge Procedure) was not found in any authoritative source for this organization. Upload the DHHS91172 Scope of Work or your provider contract under Authoritative Sources, then try again.",
      searched_documents: searched,
    };
  });

// ─── Record a discharge ────────────────────────────────────────────────

const DischargeInput = orgOnly.extend({
  client_id: z.string().uuid(),
  discharge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  discharge_reason: z.string().trim().min(3).max(4000),
  initiated_by: z.enum(["contractor", "person"]),
  attested_items: z.record(z.string(), z.boolean()),
  source_document_id: z.string().uuid().nullable(),
  source_citation: z.string().min(1).max(500),
  source_excerpt: z.string().min(1).max(20000),
  additional_notes: z.string().max(8000).optional().nullable(),
});

export const recordClientDischarge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DischargeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");

    // Verify the client belongs to this org BEFORE any write
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, organization_id, team_id, account_status")
      .eq("id", data.client_id)
      .maybeSingle();
    if (clientErr) throw new Error(clientErr.message);
    if (!client || client.organization_id !== data.organization_id) {
      throw new Error("Client not found in this organization");
    }
    if (client.account_status === "discharged") {
      throw new Error("Client is already discharged");
    }

    // 1) Append-only log first — if it fails, status is untouched
    const { error: logErr } = await supabase.from("client_discharges").insert({
      organization_id: data.organization_id,
      client_id: data.client_id,
      discharge_date: data.discharge_date,
      discharge_reason: data.discharge_reason,
      initiated_by: data.initiated_by,
      attested_items: data.attested_items,
      source_document_id: data.source_document_id,
      source_citation: data.source_citation,
      source_excerpt: data.source_excerpt,
      additional_notes: data.additional_notes ?? null,
      recorded_by: userId,
      prior_team_id: client.team_id,
    });
    if (logErr) throw new Error(logErr.message);

    // 2) Flip client status and unplace from team
    const { error: updErr } = await supabase
      .from("clients")
      .update({ account_status: "discharged", team_id: null })
      .eq("id", data.client_id)
      .eq("organization_id", data.organization_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });

export const listClientDischarges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgOnly.extend({ client_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, data.organization_id, "manage_referrals");
    const { data: rows, error } = await supabase
      .from("client_discharges")
      .select(
        "id, discharge_date, discharge_reason, initiated_by, attested_items, source_citation, source_excerpt, additional_notes, recorded_by, recorded_at",
      )
      .eq("organization_id", data.organization_id)
      .eq("client_id", data.client_id)
      .order("recorded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
