// Reusable Plan vs. Actual report generator for a client's meal plan.
//
// Used by:
//   • the manager Meal Planner panel — "Plan vs. Actual reports" section
//   • NECTAR / assistant pathways — programmatic on-demand generation
//     (e.g. "pull Blake's plan-vs-actual for the week of Jul 6")
//   • any future admin script / server function
//
// Never fabricates: empty planned cells render as "—", missing actuals show
// no outcome / note / confirmer. Renderer & styling are shared with the
// other client-tool PDFs (client-meal-plan-pdf.ts → renderPlanVsActualPdf).

import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  renderPlanVsActualPdf,
  planVsActualPdfFilename,
  weekTag,
  type MealPlanLogo,
  type MealSlot,
  type PlanActualRow,
} from "./client-meal-plan-pdf";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

const OUTCOME_LABELS: Record<string, string> = {
  ate_as_planned: "Ate as planned",
  swapped_from_another_day: "Swapped from another day",
  ate_out: "Ate out",
  changed_entirely: "Changed entirely",
};

// ── Small date helpers (kept local so the helper is self-contained) ────────
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Mon
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function weekLabelOf(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  return `${shortDate(weekStart)} – ${shortDate(end)}, ${end.getFullYear()}`;
}

export function rangeLabelOf(weekStart: Date, weeksCount: number): string {
  if (weeksCount <= 1) return weekLabelOf(weekStart);
  const lastWeek = addDays(weekStart, (weeksCount - 1) * 7);
  const end = addDays(lastWeek, 6);
  return `${shortDate(weekStart)} – ${shortDate(end)}, ${end.getFullYear()}`;
}

/** Storage-path tag for a range of weeks (single week = ISO Monday). */
export function rangeTagOf(weekStart: Date, weeksCount: number): string {
  if (weeksCount <= 1) return weekTag(weekStart);
  return `${weekTag(weekStart)}_to_${weekTag(addDays(weekStart, (weeksCount - 1) * 7))}`;
}

export type GenerateArgs = {
  clientId: string;
  /** Any date within the target week — will be snapped to the Monday. */
  weekStart: Date;
  /** Number of consecutive weeks to include (1 = single week). Clamped 1..12. */
  weeksCount?: number;
  /** Optional Supabase client (defaults to the browser client). */
  supabaseClient?: SupabaseClient;
  /** Preloaded logo bytes (skip re-fetch when the caller already has them). */
  logo?: MealPlanLogo | null;
};

export type GenerateResult = {
  bytes: Uint8Array;
  filename: string;
  weekStart: Date;
  weeksCount: number;
  rangeLabel: string;
  rangeTag: string;
  clientName: string;
  organizationId: string;
  orgName: string;
  perWeek: Array<{ weekStart: Date; weekLabel: string; rows: PlanActualRow[] }>;
};

export type ShipResult = GenerateResult & {
  storagePath: string;
  documentId: string;
};

// ── Data fetch (Supabase) ───────────────────────────────────────────────────

async function fetchOrgLogo(
  sb: SupabaseClient,
  organizationId: string,
): Promise<MealPlanLogo | null> {
  try {
    const { data } = await sb
      .from("organization_branding")
      .select("logo_path")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const path = (data as { logo_path: string | null } | null)?.logo_path;
    if (!path) return null;
    const { data: signed } = await sb.storage
      .from("org-branding")
      .createSignedUrl(path, 60 * 10);
    if (!signed?.signedUrl) return null;
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) return null;
    const mime =
      resp.headers.get("content-type") ||
      (path.endsWith(".png") ? "image/png" : "image/jpeg");
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return { bytes, mime };
  } catch {
    return null;
  }
}

async function buildRowsForWeek(
  sb: SupabaseClient,
  clientId: string,
  weekStart: Date,
): Promise<{ rows: PlanActualRow[]; weekLabel: string }> {
  const weekISO = fmtISO(weekStart);
  const startISO = weekISO;
  const endISO = fmtISO(addDays(weekStart, 6));

  const { data: planRow } = await sb
    .from("client_meal_plans")
    .select("id")
    .eq("client_id", clientId)
    .eq("week_start_date", weekISO)
    .maybeSingle();
  const planId = (planRow as { id: string } | null)?.id ?? null;

  type MealLite = { day_of_week: number; meal_slot: MealSlot; label: string };
  type ActualLite = {
    actual_date: string;
    meal_slot: MealSlot;
    outcome: string;
    note: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
  };

  let meals: MealLite[] = [];
  let actuals: ActualLite[] = [];
  if (planId) {
    const [mRes, aRes] = await Promise.all([
      sb
        .from("client_meals")
        .select("day_of_week, meal_slot, label")
        .eq("meal_plan_id", planId),
      sb
        .from("client_meal_actuals")
        .select("actual_date, meal_slot, outcome, note, confirmed_by, confirmed_at")
        .eq("meal_plan_id", planId)
        .gte("actual_date", startISO)
        .lte("actual_date", endISO),
    ]);
    meals = (mRes.data ?? []) as MealLite[];
    actuals = (aRes.data ?? []) as ActualLite[];
  }

  // Resolve confirmer display names.
  const ids = Array.from(
    new Set(actuals.map((a) => a.confirmed_by).filter((x): x is string => !!x)),
  );
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, first_name, last_name, full_name")
      .in("id", ids);
    for (const p of (profs ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      full_name: string | null;
    }>) {
      names[p.id] =
        p.full_name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        "Staff";
    }
  }

  const rows: PlanActualRow[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const d = addDays(weekStart, dow);
    const iso = fmtISO(d);
    for (const slot of SLOTS) {
      const planned =
        meals
          .filter((m) => m.day_of_week === dow && m.meal_slot === slot)
          .map((m) => m.label || "(unnamed)")
          .join(", ") || "—";
      const a = actuals.find((x) => x.actual_date === iso && x.meal_slot === slot);
      rows.push({
        day_of_week: dow,
        meal_slot: slot,
        date_iso: iso,
        planned,
        outcome: a ? OUTCOME_LABELS[a.outcome] ?? a.outcome : null,
        note: a?.note ?? null,
        confirmed_by_name: a?.confirmed_by ? names[a.confirmed_by] ?? "Staff" : null,
        confirmed_at: a?.confirmed_at ?? null,
      });
    }
  }
  return { rows, weekLabel: weekLabelOf(weekStart) };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a Plan vs. Actual PDF (bytes + metadata) for a client for a chosen
 * week or consecutive range of weeks. Reusable by the manager UI and by any
 * NECTAR/assistant pathway.
 */
export async function generatePlanVsActualReport(
  args: GenerateArgs,
): Promise<GenerateResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const weeksCount = Math.max(1, Math.min(12, args.weeksCount ?? 1));
  const weekStart = mondayOf(args.weekStart);

  // Client + org identity
  const { data: clientRow, error: cErr } = await sb
    .from("clients")
    .select("first_name, last_name, organization_id")
    .eq("id", args.clientId)
    .maybeSingle();
  if (cErr) throw cErr;
  const c = clientRow as
    | { first_name: string | null; last_name: string | null; organization_id: string }
    | null;
  if (!c) throw new Error("Client not found");
  const clientName =
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client";
  const organizationId = c.organization_id;

  const { data: orgRow } = await sb
    .from("organizations")
    .select("organization_name")
    .eq("id", organizationId)
    .maybeSingle();
  const orgName =
    (orgRow as { organization_name: string | null } | null)?.organization_name ?? "";

  const logo =
    args.logo !== undefined ? args.logo : await fetchOrgLogo(sb, organizationId);

  const rangeLabel = rangeLabelOf(weekStart, weeksCount);
  const rangeTag = rangeTagOf(weekStart, weeksCount);

  const perWeek: GenerateResult["perWeek"] = [];
  for (let i = 0; i < weeksCount; i++) {
    const ws = addDays(weekStart, i * 7);
    const built = await buildRowsForWeek(sb, args.clientId, ws);
    perWeek.push({ weekStart: ws, weekLabel: built.weekLabel, rows: built.rows });
  }

  let bytes: Uint8Array;
  if (perWeek.length === 1) {
    const w = perWeek[0];
    bytes = await renderPlanVsActualPdf({
      orgName,
      logo,
      clientName,
      weekLabel: w.weekLabel,
      rows: w.rows,
    });
  } else {
    // Merge per-week PDFs into one continuous document so a range prints as
    // one audit-ready artifact (each week keeps its own header + footer).
    const merged = await PDFDocument.create();
    merged.setTitle(
      `Meal Plan — Plan vs. Actual — ${clientName} — ${rangeLabel}`,
    );
    for (const w of perWeek) {
      const perBytes = await renderPlanVsActualPdf({
        orgName,
        logo,
        clientName,
        weekLabel: w.weekLabel,
        rows: w.rows,
      });
      const src = await PDFDocument.load(perBytes);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
    }
    bytes = await merged.save();
  }

  const filename = planVsActualPdfFilename(clientName, rangeLabel);

  return {
    bytes,
    filename,
    weekStart,
    weeksCount,
    rangeLabel,
    rangeTag,
    clientName,
    organizationId,
    orgName,
    perWeek,
  };
}

/**
 * Generate the report and ship a point-in-time snapshot to the client's
 * documents (bucket: client-documents; document_type: meal_plan_plan_vs_actual).
 */
export async function shipPlanVsActualReport(
  args: GenerateArgs,
): Promise<ShipResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const report = await generatePlanVsActualReport({ ...args, supabaseClient: sb });

  const uid = (await sb.auth.getUser()).data.user?.id ?? null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${report.organizationId}/${args.clientId}/meal-plans/plan-vs-actual-${report.rangeTag}-${stamp}.pdf`;
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

  const fileName = `Meal Plan — Plan vs. Actual ${report.rangeLabel}.pdf`;
  const { data: inserted, error: insErr } = await sb
    .from("client_documents")
    .insert({
      client_id: args.clientId,
      organization_id: report.organizationId,
      file_name: fileName,
      document_type: "meal_plan_plan_vs_actual",
      file_url: `storage://client-documents/${storagePath}`,
      storage_path: storagePath,
      file_size_bytes: report.bytes.byteLength,
      uploaded_by: uid,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return {
    ...report,
    storagePath,
    documentId: (inserted as { id: string }).id,
  };
}
