// Reusable Chore Chart report generator + ship-to-file helper.
// A chore chart belongs to a living space; ship snapshots to each client's
// file who is linked to that space (that's the audit-evidence surface).
// Reuses renderChoreChartPdf — never duplicates PDF rendering.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import { renderChoreChartPdf, type ChoreChartPdfPayload } from "./chore-chart-pdf";
import { fetchOrgName } from "./client-report-shared";

export type ChoreChartReportArgs = {
  spaceId: string;
  supabaseClient?: SupabaseClient;
  /** Optional ISO Monday for the week this chart covers. When provided the
   *  report also includes per-outcome tallies for that Mon–Sun window. */
  weekStartISO?: string;
};


export type ChoreChartReportResult = {
  bytes: Uint8Array;
  filename: string;
  spaceId: string;
  spaceName: string;
  spaceType: string;
  organizationId: string;
  orgName: string;
  clientIds: string[]; // clients linked to this space
  dateTag: string; // YYYY-MM-DD
  dateLabel: string;
};

export type ShippedChoreChartReport = ChoreChartReportResult & {
  snapshots: Array<{ clientId: string; storagePath: string; documentId: string }>;
};

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "space"
  );
}

export async function generateChoreChartReport(
  args: ChoreChartReportArgs,
): Promise<ChoreChartReportResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const { data: spaceRow, error: sErr } = await sb
    .from("chore_spaces")
    .select("id, organization_id, name, space_type")
    .eq("id", args.spaceId)
    .maybeSingle();
  if (sErr) throw sErr;
  const space = spaceRow as
    | { id: string; organization_id: string; name: string; space_type: string }
    | null;
  if (!space) throw new Error("Chore space not found");

  const orgName = await fetchOrgName(sb, space.organization_id);

  // Compute Mon–Sun window for outcome tallies when weekStartISO given.
  let compRange: { fromISO: string; toISO: string } | null = null;
  if (args.weekStartISO && /^\d{4}-\d{2}-\d{2}$/.test(args.weekStartISO)) {
    const start = new Date(args.weekStartISO + "T12:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    compRange = {
      fromISO: args.weekStartISO,
      toISO: end.toISOString().slice(0, 10),
    };
  }

  const [linksRes, defsRes, rotRes, dailyRes, compsRes] = await Promise.all([
    sb.from("chore_space_clients").select("client_id").eq("space_id", space.id),
    sb
      .from("chore_definitions")
      .select("id, chore_name, task_list, sort_order")
      .eq("space_id", space.id)
      .order("sort_order"),
    sb
      .from("chore_client_rotation")
      .select("client_id, day_of_week, definition_id, is_free_day, note")
      .eq("space_id", space.id),
    sb
      .from("chore_daily_items")
      .select("label, detail, sort_order")
      .eq("space_id", space.id)
      .order("sort_order"),
    compRange
      ? sb
          .from("chore_completions")
          .select("outcome, client_id, completion_date, source")
          .eq("space_id", space.id)
          .gte("completion_date", compRange.fromISO)
          .lte("completion_date", compRange.toISO)
      : Promise.resolve({ data: [] as Array<{ outcome: string; client_id: string | null }> }),
  ]);



  const linkedClientIds = ((linksRes.data ?? []) as Array<{ client_id: string }>).map(
    (x) => x.client_id,
  );

  const [clientsRes, supportRes] = await Promise.all([
    linkedClientIds.length
      ? sb.from("clients").select("id, first_name, last_name").in("id", linkedClientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; last_name: string }> }),
    linkedClientIds.length
      ? sb
          .from("client_chore_support")
          .select("client_id, status, reason, goal_note")
          .in("client_id", linkedClientIds)
      : Promise.resolve({ data: [] as Array<{ client_id: string; status: string; reason: string | null; goal_note: string | null }> }),
  ]);

  const clients = (clientsRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
  }>;

  const defs = ((defsRes.data ?? []) as Array<{
    id: string;
    chore_name: string;
    task_list: string;
  }>);
  const defNameById = new Map(defs.map((d) => [d.id, d.chore_name] as const));

  const OUTCOMES = ["completed", "completed_with_support", "offered_declined", "not_addressed"] as const;
  type Outcome = typeof OUTCOMES[number];
  const zero = (): Record<Outcome, number> =>
    ({ completed: 0, completed_with_support: 0, offered_declined: 0, not_addressed: 0 });
  const totalOutcomes = zero();
  const perClientOutcomes = new Map<string, Record<Outcome, number>>();
  for (const c of ((compsRes.data ?? []) as Array<{ outcome: string; client_id: string | null }>)) {
    const o = c.outcome as Outcome;
    if (!(OUTCOMES as readonly string[]).includes(o)) continue;
    totalOutcomes[o] += 1;
    if (c.client_id) {
      const bucket = perClientOutcomes.get(c.client_id) ?? zero();
      bucket[o] += 1;
      perClientOutcomes.set(c.client_id, bucket);
    }
  }

  const supportByClient = new Map(
    ((supportRes.data ?? []) as Array<{
      client_id: string; status: string; reason: string | null; goal_note: string | null;
    }>).map((r) => [r.client_id, r]),
  );


  const payload: ChoreChartPdfPayload = {
    weekStartISO: args.weekStartISO,
    orgName,
    spaceName: space.name,
    spaceType: space.space_type,
    clients: clients.map((c) => {
      const sup = supportByClient.get(c.id);
      const outcomes = perClientOutcomes.get(c.id) ?? null;
      return {
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        supportReason: (sup?.status === "active" ? sup.reason : null) as
          | "pcsp_goal" | "intake_need" | "manual" | null,
        supportNote: sup?.status === "active" ? sup.goal_note ?? null : null,
        outcomes,
      };
    }),
    dailyItems: ((dailyRes.data ?? []) as Array<{ label: string; detail: string | null }>).map(
      (d) => ({ label: d.label, detail: d.detail }),
    ),
    definitions: defs.map((d) => ({
      id: d.id,
      chore_name: d.chore_name,
      task_list: d.task_list,
    })),
    clientCells: ((rotRes.data ?? []) as Array<{
      client_id: string;
      day_of_week: number;
      definition_id: string | null;
      is_free_day: boolean;
      note: string | null;
    }>).map((r) => ({
      clientId: r.client_id,
      day: r.day_of_week,
      definitionName: r.definition_id ? defNameById.get(r.definition_id) ?? null : null,
      isFreeDay: r.is_free_day,
      note: r.note,
    })),
    weeklyOutcomeTotals: compRange
      ? {
          completed: totalOutcomes.completed,
          completed_with_support: totalOutcomes.completed_with_support,
          offered_declined: totalOutcomes.offered_declined,
          not_addressed: totalOutcomes.not_addressed,
        }
      : null,
  };


  const bytes = await renderChoreChartPdf(payload);
  const today = new Date();
  const dateTag = today.toISOString().slice(0, 10);
  const dateLabel = today.toLocaleDateString();

  return {
    bytes,
    filename: `Chore Chart — ${space.name} — ${dateLabel}.pdf`,
    spaceId: space.id,
    spaceName: space.name,
    spaceType: space.space_type,
    organizationId: space.organization_id,
    orgName,
    clientIds: linkedClientIds,
    dateTag,
    dateLabel,
  };
}

/**
 * Ship a point-in-time chore-chart snapshot to each linked client's file.
 * The chore chart is org-plane per space; every linked client's audit file
 * receives an identical snapshot so the physical chart posted in the home
 * has traceable per-client evidence.
 */
export async function shipChoreChartReport(
  args: ChoreChartReportArgs & { clientIds?: string[] },
): Promise<ShippedChoreChartReport> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const report = await generateChoreChartReport({ ...args, supabaseClient: sb });
  const targets =
    args.clientIds && args.clientIds.length ? args.clientIds : report.clientIds;
  if (!targets.length) {
    throw new Error("No clients linked to this space — nothing to ship");
  }

  const uid = (await sb.auth.getUser()).data.user?.id ?? null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const spaceSlug = slug(report.spaceName);
  const snapshots: ShippedChoreChartReport["snapshots"] = [];

  for (const clientId of targets) {
    const storagePath = `${report.organizationId}/${clientId}/chore-charts/chore-chart-${spaceSlug}-${report.dateTag}-${stamp}.pdf`;
    const blob = new Blob([new Uint8Array(report.bytes)], {
      type: "application/pdf",
    });
    const { error: upErr } = await sb.storage
      .from("client-documents")
      .upload(storagePath, blob, {
        upsert: false,
        contentType: "application/pdf",
      });
    if (upErr) throw upErr;

    const fileName = `Chore Chart — ${report.spaceName} ${report.dateLabel}.pdf`;
    const { data: inserted, error: insErr } = await sb
      .from("client_documents")
      .insert({
        client_id: clientId,
        organization_id: report.organizationId,
        file_name: fileName,
        document_type: "chore_chart",
        file_url: `storage://client-documents/${storagePath}`,
        storage_path: storagePath,
        file_size_bytes: report.bytes.byteLength,
        uploaded_by: uid,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    snapshots.push({
      clientId,
      storagePath,
      documentId: (inserted as { id: string }).id,
    });
  }

  return { ...report, snapshots };
}
