import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

type ExtractedItem = {
  sub_folder: "staff" | "client" | "admin" | "other";
  title: string;
  description?: string;
  source_hint?: string;
  period_start?: string;
  period_end?: string;
};

const SYSTEM_PROMPT = `You are a compliance analyst for a Utah DSPD provider audit (Division of Services for People with Disabilities). You will receive the text of an official audit notification letter from DHS / DSPD / the State.

Your job is to extract:
1. A short "expectations_summary" (2-4 sentences) describing the audit scope.
2. The fiscal year referenced (e.g. "FY26").
3. The overall audit timeline start/end dates if present (ISO yyyy-mm-dd) — the outermost date range that covers the whole request.
4. A complete list of REQUIRED DOCUMENTS / ITEMS the provider must produce, grouped into one of four sub-folders: "staff", "client", "admin", "other".

Real audit letters often request different document types for different, independently-random date windows within the same letter — e.g. "shift notes from May through July" and "incident reports from November through December" are two different windows, not one shared range. For each item, ALSO try to extract that item's OWN period_start/period_end (ISO yyyy-mm-dd) whenever the letter specifies a date range specific to that document type. Only set period_start/period_end on an item when the letter clearly gives it its own range — leave them null when the item is only covered by the letter's one overall timeline, so the packet-level timeline applies to it instead.

For each item, set source_hint to one of these platform tables when the document is something HIVE typically tracks:
  evv_timesheets, billing_submissions, incident_reports, certifications, client_documents, profiles, courses, medications, pba_accounts, scheduled_shifts
Use null if no source matches.

Return STRICT JSON only.`;

const ItemSchema = z.object({
  sub_folder: z.enum(["staff", "client", "admin", "other"]),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().nullable(),
  source_hint: z.string().max(80).optional().nullable(),
  period_start: z.string().max(20).optional().nullable(),
  period_end: z.string().max(20).optional().nullable(),
});

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

const ExtractionSchema = z.object({
  fiscal_year: z.string().max(20).optional().nullable(),
  expectations_summary: z.string().max(2000).optional().nullable(),
  timeline_start: z.string().optional().nullable(),
  timeline_end: z.string().optional().nullable(),
  items: z.array(ItemSchema).max(200),
});

async function callLovableAI(letterText: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `AUDIT LETTER:\n\n${letterText.slice(0, 60000)}` },
      ],
      response_format: { type: "json_object" },
    });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? "{}";
  return ExtractionSchema.parse(JSON.parse(content));
}

/**
 * Parse an audit letter, persist an audit_packet + audit_packet_items, and
 * auto-fill items whose source_hint matches existing data in the org.
 */
export const parseAndProduceAuditPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organization_id: z.string().uuid(),
        provider_name: z.string().min(1).max(200),
        letter_text: z.string().min(50).max(200000),
        audit_letter_path: z.string().max(500).optional().nullable(),
        fallback_fiscal_year: z.string().max(20).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin/manager for this org
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role, active")
      .eq("organization_id", data.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership?.active || !["admin", "manager", "super_admin"].includes(membership.role)) {
      throw new Error("Only admins or managers can produce an audit packet.");
    }

    const extraction = await callLovableAI(data.letter_text);
    const fiscalYear =
      extraction.fiscal_year ?? data.fallback_fiscal_year ?? `FY${String(new Date().getFullYear() % 100).padStart(2, "0")}`;
    const packetName = `${fiscalYear} — ${data.provider_name}`;
    const timelineStart = normalizeIsoDate(extraction.timeline_start);
    const timelineEnd = normalizeIsoDate(extraction.timeline_end);

    // If the requested timeline reaches back before this org went live on
    // HIVE, surface a clear disclosure — those records were never captured
    // in HIVE and must be sourced from the provider's prior system. Snapshot
    // the note at creation time so it doesn't silently change if go_live_date
    // is edited later.
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("go_live_date, created_at" as any)
      .eq("id", data.organization_id)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    const org = orgRow as unknown as { go_live_date: string | null; created_at: string } | null;
    const goLiveDate = (org?.go_live_date ?? org?.created_at ?? "").slice(0, 10);
    const predatesGoLiveNote =
      timelineStart && goLiveDate && timelineStart < goLiveDate
        ? `Note: this audit period includes dates before ${data.provider_name} began using Hive (${goLiveDate}). Records from ${timelineStart} to ${goLiveDate} were not captured in Hive and must be sourced from your prior records system.`
        : null;

    const { data: packet, error: pkErr } = await supabase
      .from("audit_packets")
      .insert({
        organization_id: data.organization_id,
        fiscal_year: fiscalYear,
        provider_name: data.provider_name,
        name: packetName,
        timeline_start: timelineStart,
        timeline_end: timelineEnd,
        expectations_summary: extraction.expectations_summary ?? null,
        audit_letter_path: data.audit_letter_path ?? null,
        audit_letter_text: data.letter_text,
        status: "draft",
        created_by: userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        predates_go_live_note: predatesGoLiveNote,
      } as any)
      .select("*")
      .single();
    if (pkErr) throw new Error(pkErr.message);

    // Insert items with default status 'missing'. When the packet's timeline
    // predates the org's Hive go-live date, a pinned disclosure item is
    // inserted first so it is the very first checklist item a reviewer sees —
    // not a dismissable banner, an actual item row.
    const disclosureRows = predatesGoLiveNote
      ? [
          {
            packet_id: packet.id,
            organization_id: data.organization_id,
            sub_folder: "admin" as const,
            title: "Pre-Hive period disclosure",
            description: predatesGoLiveNote,
            source_hint: null,
            status: "confirmed" as const,
            position: -1,
            is_disclosure: true,
          },
        ]
      : [];
    const itemRows = [
      ...disclosureRows,
      ...extraction.items.map((it, idx) => ({
        packet_id: packet.id,
        organization_id: data.organization_id,
        sub_folder: it.sub_folder,
        title: it.title,
        description: it.description ?? null,
        source_hint: it.source_hint ?? null,
        status: "missing" as const,
        position: idx,
        period_start: normalizeIsoDate(it.period_start),
        period_end: normalizeIsoDate(it.period_end),
      })),
    ];
    if (itemRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: itErr } = await supabase.from("audit_packet_items").insert(itemRows as any);
      if (itErr) throw new Error(itErr.message);
    }

    // Auto-fill: for each known source_hint, count matching rows in the org
    const orgId = data.organization_id;
    const counters: Record<string, () => Promise<number>> = {
      evv_timesheets: async () => {
        const { count } = await supabase
          .from("evv_timesheets")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      billing_submissions: async () => {
        const { count } = await supabase
          .from("billing_submissions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      incident_reports: async () => {
        const { count } = await supabase
          .from("incident_reports")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      certifications: async () => {
        const { count } = await supabase
          .from("certifications")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      client_documents: async () => {
        const { count } = await supabase
          .from("client_documents")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      scheduled_shifts: async () => {
        const { count } = await supabase
          .from("scheduled_shifts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
      pba_accounts: async () => {
        const { count } = await supabase
          .from("pba_accounts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId);
        return count ?? 0;
      },
    };

    const { data: created } = await supabase
      .from("audit_packet_items")
      .select("id, source_hint")
      .eq("packet_id", packet.id);

    for (const row of created ?? []) {
      const hint = row.source_hint ?? "";
      const counter = counters[hint];
      if (!counter) continue;
      try {
        const n = await counter();
        if (n > 0) {
          await supabase
            .from("audit_packet_items")
            .update({
              status: "auto_filled",
              evidence_count: n,
              evidence_refs: [{ source: hint, count: n }],
            })
            .eq("id", row.id);
        } else {
          await supabase
            .from("audit_packet_items")
            .update({ status: "needs_review" })
            .eq("id", row.id);
        }
      } catch {
        // best-effort auto-fill — ignore counter failures
      }
    }

    return { packet_id: packet.id, items_created: extraction.items.length };
  });
