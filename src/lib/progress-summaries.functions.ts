import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  MONTHLY_SUMMARY_CODES,
  QUARTERLY_SUMMARY_CODES,
  periodsOwedForClient,
  type SummaryPeriod,
} from "./progress-summaries";

export type ProgressSummaryRow = {
  id: string;
  organization_id: string;
  client_id: string;
  period_kind: "quarterly" | "monthly";
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  service_codes: string[];
  requires_upi_attestation: boolean;
  completed_at: string | null;
  completed_by: string | null;
  upi_entered_at: string | null;
  upi_entered_by: string | null;
};

/**
 * Idempotent: ensures progress-summary rows exist for every closed period
 * each client owes based on their active billing codes. Safe to call on
 * every page load — the unique (org, client, kind, label) constraint makes
 * upsert a no-op when rows already exist.
 */
export const ensureCurrentSummaryPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    // Pull every active billing code for the org, grouped by client.
    const today = new Date().toISOString().slice(0, 10);
    const { data: codes, error: codesErr } = await supabase
      .from("client_billing_codes")
      .select("client_id, service_code, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId);
    if (codesErr) throw new Error(codesErr.message);

    type Bucket = { quarterly: Set<string>; monthly: Set<string> };
    const byClient = new Map<string, Bucket>();
    for (const row of (codes ?? []) as Array<{
      client_id: string;
      service_code: string;
      service_start_date: string | null;
      service_end_date: string | null;
    }>) {
      // Only count currently-active authorizations.
      if (row.service_start_date && row.service_start_date > today) continue;
      if (row.service_end_date && row.service_end_date < today) continue;
      const code = (row.service_code ?? "").toUpperCase();
      if (!QUARTERLY_SUMMARY_CODES.has(code) && !MONTHLY_SUMMARY_CODES.has(code)) continue;
      const b = byClient.get(row.client_id) ?? { quarterly: new Set(), monthly: new Set() };
      if (QUARTERLY_SUMMARY_CODES.has(code)) b.quarterly.add(code);
      if (MONTHLY_SUMMARY_CODES.has(code)) b.monthly.add(code);
      byClient.set(row.client_id, b);
    }

    if (byClient.size === 0) return { ensured: 0 };

    const now = new Date();
    type Insert = {
      organization_id: string;
      client_id: string;
      period_kind: "quarterly" | "monthly";
      period_label: string;
      period_start: string;
      period_end: string;
      due_date: string;
      service_codes: string[];
      requires_upi_attestation: boolean;
    };
    const inserts: Insert[] = [];
    for (const [clientId, bucket] of byClient) {
      const codesList = [...bucket.quarterly, ...bucket.monthly];
      const periods = periodsOwedForClient(codesList, now);
      for (const p of periods) {
        const triggers = p.period_kind === "quarterly"
          ? [...bucket.quarterly]
          : [...bucket.monthly];
        if (triggers.length === 0) continue;
        inserts.push({
          organization_id: data.organizationId,
          client_id: clientId,
          period_kind: p.period_kind,
          period_label: p.period_label,
          period_start: p.period_start,
          period_end: p.period_end,
          due_date: p.due_date,
          service_codes: triggers,
          requires_upi_attestation: p.period_kind === "monthly",
        });
      }
    }
    if (inserts.length === 0) return { ensured: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .upsert(inserts, { onConflict: "organization_id,client_id,period_kind,period_label", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ensured: inserts.length };
  });

/** List all open (uncompleted) summaries for the org. */
export const listOpenSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("client_progress_summaries")
      .select("id, organization_id, client_id, period_kind, period_label, period_start, period_end, due_date, service_codes, requires_upi_attestation, completed_at, completed_by, upi_entered_at, upi_entered_by")
      .eq("organization_id", data.organizationId)
      .is("completed_at", null)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProgressSummaryRow[];
  });

/** Mark a non-SEI summary complete. */
export const markSummaryCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({ completed_at: new Date().toISOString(), completed_by: userId })
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Attest that an SEI monthly summary has been typed into the state UPI system. */
export const attestSummaryUpiEntered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const ts = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({
        upi_entered_at: ts,
        upi_entered_by: userId,
        completed_at: ts,
        completed_by: userId,
      })
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .eq("requires_upi_attestation", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { SummaryPeriod };
