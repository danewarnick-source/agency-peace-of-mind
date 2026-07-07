// Reusable Client Budget report generator + ship-to-file helper.
// Used by: the manager Client Budget panel UI, NECTAR/assistant pathways,
// and any future admin script. Reuses renderClientBudgetPdf — never
// duplicates PDF rendering. Empty budgets render "—".

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import {
  renderClientBudgetPdf,
  budgetPdfFilename,
  type BudgetPdfPayload,
} from "./client-budget-pdf";
import { fetchOrgLogo, fetchOrgName, fetchClientIdentity } from "./client-report-shared";

export type BudgetReportArgs = {
  clientId: string;
  /** "YYYY-MM" or "YYYY-MM-DD" — snapped to first-of-month. */
  periodMonth: string;
  supabaseClient?: SupabaseClient;
};

export type BudgetReportResult = {
  bytes: Uint8Array;
  filename: string;
  clientId: string;
  clientName: string;
  organizationId: string;
  orgName: string;
  periodMonth: string; // YYYY-MM-01
  periodTag: string;   // YYYY-MM
  periodLabel: string; // "July 2026"
};

export type ShippedBudgetReport = BudgetReportResult & {
  storagePath: string;
  documentId: string;
};

const tagOf = (m: string) => m.slice(0, 7);
const firstOfMonth = (m: string) => `${m.slice(0, 7)}-01`;
const labelOf = (m: string) =>
  new Date(`${firstOfMonth(m)}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

type LineRow = {
  section: "income" | "expense" | "other";
  sort_order: number;
  label: string | null;
  non_variable: number | null;
  variable: number | null;
  notes: string | null;
  day_of_month: number | null;
};

export async function generateBudgetReport(
  args: BudgetReportArgs,
): Promise<BudgetReportResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const period = firstOfMonth(args.periodMonth);
  const periodTag = tagOf(args.periodMonth);
  const periodLabel = labelOf(args.periodMonth);

  const { clientName, organizationId } = await fetchClientIdentity(sb, args.clientId);
  const orgName = await fetchOrgName(sb, organizationId);

  const { data: budgetRow, error: bErr } = await sb
    .from("client_budgets")
    .select("id, details")
    .eq("client_id", args.clientId)
    .eq("period_month", period)
    .maybeSingle();
  if (bErr) throw bErr;
  const budget = budgetRow as { id: string; details: string | null } | null;

  let lines: LineRow[] = [];
  if (budget) {
    const { data, error } = await sb
      .from("client_budget_lines")
      .select("section, sort_order, label, non_variable, variable, notes, day_of_month")
      .eq("budget_id", budget.id);
    if (error) throw error;
    lines = (data ?? []) as LineRow[];
  }

  const toSection = (section: LineRow["section"]) =>
    lines
      .filter((l) => l.section === section)
      .slice()
      .sort(
        (a, b) =>
          (a.day_of_month ?? 99) - (b.day_of_month ?? 99) ||
          a.sort_order - b.sort_order,
      )
      .map((l) => ({
        label: l.label ?? "",
        non_variable: Number(l.non_variable) || 0,
        variable: Number(l.variable) || 0,
        notes: l.notes,
        day_of_month: l.day_of_month,
      }));

  const payload: BudgetPdfPayload = {
    orgName,
    logo: await fetchOrgLogo(sb, organizationId),
    clientName,
    periodLabel,
    details: budget?.details ?? null,
    income: toSection("income"),
    expense: toSection("expense"),
    other: toSection("other"),
  };

  const bytes = await renderClientBudgetPdf(payload);
  return {
    bytes,
    filename: budgetPdfFilename(clientName, periodLabel),
    clientId: args.clientId,
    clientName,
    organizationId,
    orgName,
    periodMonth: period,
    periodTag,
    periodLabel,
  };
}

export async function shipBudgetReport(
  args: BudgetReportArgs,
): Promise<ShippedBudgetReport> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const report = await generateBudgetReport({ ...args, supabaseClient: sb });

  const uid = (await sb.auth.getUser()).data.user?.id ?? null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${report.organizationId}/${report.clientId}/budgets/financial-support-${report.periodTag}-${stamp}.pdf`;
  const blob = new Blob([new Uint8Array(report.bytes)], { type: "application/pdf" });

  const { error: upErr } = await sb.storage
    .from("client-documents")
    .upload(storagePath, blob, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw upErr;

  const fileName = `Financial Support — Monthly Budget ${report.periodLabel}.pdf`;
  const { data: inserted, error: insErr } = await sb
    .from("client_documents")
    .insert({
      client_id: report.clientId,
      organization_id: report.organizationId,
      file_name: fileName,
      document_type: "financial_support_budget",
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
