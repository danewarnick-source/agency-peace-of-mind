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
function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : "?";
}
function fmtRange(s: string | null, e: string | null) {
  if (!s && !e) return null;
  return `${fmtTime(s)} – ${fmtTime(e)}`;
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

  const [linksRes, defsRes, rotRes, rowsRes, cellsRes] = await Promise.all([
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
      .from("chore_shift_rows")
      .select("id, label, start_time, end_time, sort_order")
      .eq("space_id", space.id)
      .order("sort_order"),
    sb
      .from("chore_shift_cells")
      .select("shift_row_id, day_of_week, task_text, helps_client_id, definition_id")
      .eq("space_id", space.id),
  ]);

  const linkedClientIds = ((linksRes.data ?? []) as Array<{ client_id: string }>).map(
    (x) => x.client_id,
  );
  const clients = linkedClientIds.length
    ? (((await sb
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", linkedClientIds)).data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
      }>)
    : [];

  const defs = ((defsRes.data ?? []) as Array<{
    id: string;
    chore_name: string;
    task_list: string;
  }>);
  const defNameById = new Map(defs.map((d) => [d.id, d.chore_name] as const));
  const nameOf = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "";
  };

  const payload: ChoreChartPdfPayload = {
    orgName,
    spaceName: space.name,
    spaceType: space.space_type,
    clients: clients.map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
    })),
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
    shiftRows: ((rowsRes.data ?? []) as Array<{
      id: string;
      label: string;
      start_time: string | null;
      end_time: string | null;
    }>).map((r) => ({
      id: r.id,
      label: r.label,
      timeRange: fmtRange(r.start_time, r.end_time),
    })),
    shiftCells: ((cellsRes.data ?? []) as Array<{
      shift_row_id: string;
      day_of_week: number;
      task_text: string;
      helps_client_id: string | null;
      definition_id: string | null;
    }>).map((c) => ({
      shiftRowId: c.shift_row_id,
      day: c.day_of_week,
      taskText: c.task_text,
      helpsClientName: c.helps_client_id ? nameOf(c.helps_client_id) || null : null,
      definitionName: c.definition_id ? defNameById.get(c.definition_id) ?? null : null,
    })),
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
