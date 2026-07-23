import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  clientNeedsGoalProgress,
  FINANCIAL_STATEMENT_CODES,
  MONTHLY_SUMMARY_CODES,
  QUARTERLY_SUMMARY_CODES,
  recentMonthlyPeriods,
  recentQuarterlyPeriods,
  type SummaryPeriod,
} from "./progress-summaries";

export type ProgressSummaryStatus =
  | "pending"
  | "draft"
  | "in_review"
  | "finalized"
  | "no_source";

export type ProgressSummaryKind = "narrative" | "financial_statement";

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
  summary_kind: ProgressSummaryKind;
  status: ProgressSummaryStatus;
  draft_content: string | null;
  final_content: string | null;
  drafted_at: string | null;
  drafted_by: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  finalized_by_name: string | null;
  include_goal_progress: boolean;
};

const SUMMARY_SELECT =
  "id, organization_id, client_id, period_kind, period_label, period_start, period_end, due_date, service_codes, requires_upi_attestation, completed_at, completed_by, upi_entered_at, upi_entered_by, summary_kind, status, draft_content, final_content, drafted_at, drafted_by, finalized_at, finalized_by, finalized_by_name, include_goal_progress";

/**
 * Idempotent: ensures progress-summary rows exist for every closed period
 * each client owes based on their active billing codes. Safe to call on
 * every page load.
 *
 * Three flavors of rows per period:
 *   - Quarterly narrative (HHS/RHS/DSI/SLH/SLN)
 *   - Monthly narrative (SEI/PN1/PN2; SEI also flips requires_upi_attestation)
 *   - Monthly financial statement (PBA) — summary_kind = 'financial_statement'
 */
export const ensureCurrentSummaryPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const today = new Date().toISOString().slice(0, 10);

    // Org-wide floor: a period that closed before this org actually started
    // using HIVE should never be generated, even if a client's own
    // service_start_date would otherwise allow it — HIVE has no records from
    // before it was adopted. Defaults to created_at when unset (conservative:
    // never assumes pre-adoption documentation exists).
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("go_live_date, created_at" as any)
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    const org = orgRow as unknown as { go_live_date: string | null; created_at: string } | null;
    const goLiveDate = (org?.go_live_date ?? org?.created_at ?? "").slice(0, 10);

    const { data: codes, error: codesErr } = await supabase
      .from("client_billing_codes")
      .select("client_id, service_code, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId);
    if (codesErr) throw new Error(codesErr.message);

    // Per code, keep its service_start_date so period generation below can
    // skip any period that closed before the client's service for that code
    // actually began — otherwise a client onboarded this month would get a
    // full lookback window of periods marked overdue for service they never
    // received.
    type CodeEntry = { code: string; start: string | null };
    const byClient = new Map<string, CodeEntry[]>();
    for (const row of (codes ?? []) as Array<{
      client_id: string;
      service_code: string;
      service_start_date: string | null;
      service_end_date: string | null;
    }>) {
      if (row.service_start_date && row.service_start_date > today) continue;
      if (row.service_end_date && row.service_end_date < today) continue;
      const code = (row.service_code ?? "").toUpperCase();
      if (
        !QUARTERLY_SUMMARY_CODES.has(code) &&
        !MONTHLY_SUMMARY_CODES.has(code) &&
        !FINANCIAL_STATEMENT_CODES.has(code)
      ) continue;
      const arr = byClient.get(row.client_id) ?? [];
      arr.push({ code, start: row.service_start_date ?? null });
      byClient.set(row.client_id, arr);
    }

    if (byClient.size === 0) return { ensured: 0 };

    const now = new Date();
    // Org-wide go-live floor applies before any per-client filtering below —
    // a period closing before the org went live on HIVE is dropped for
    // every client, not just clients whose own service predates it.
    const quarterly = recentQuarterlyPeriods(now).filter((p) => !goLiveDate || p.period_end >= goLiveDate);
    const monthly = recentMonthlyPeriods(now).filter((p) => !goLiveDate || p.period_end >= goLiveDate);

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
      summary_kind: ProgressSummaryKind;
      include_goal_progress: boolean;
    };
    const inserts: Insert[] = [];

    // Only create a period row for a client if at least one of the bucket's
    // codes had already started (service_start_date <= period_end) by that
    // period's close. A client whose service began mid-period still gets
    // that period generated — nothing before their actual start date does.
    const startedByPeriodEnd = (entries: CodeEntry[], periodEnd: string) =>
      entries.filter((e) => !e.start || e.start <= periodEnd);

    for (const [clientId, entries] of byClient) {
      const quarterlyEntries = entries.filter((e) => QUARTERLY_SUMMARY_CODES.has(e.code));
      const monthlyNarrativeEntries = entries.filter((e) => MONTHLY_SUMMARY_CODES.has(e.code));
      const monthlyFinancialEntries = entries.filter((e) => FINANCIAL_STATEMENT_CODES.has(e.code));

      // Quarterly narrative.
      for (const p of quarterly) {
        const active = startedByPeriodEnd(quarterlyEntries, p.period_end);
        if (active.length === 0) continue;
        const services = [...new Set(active.map((e) => e.code))];
        inserts.push({
          organization_id: data.organizationId,
          client_id: clientId,
          period_kind: p.period_kind,
          period_label: `${p.period_label}`,
          period_start: p.period_start,
          period_end: p.period_end,
          due_date: p.due_date,
          service_codes: services,
          requires_upi_attestation: false,
          summary_kind: "narrative",
          include_goal_progress: clientNeedsGoalProgress(services),
        });
      }

      // Monthly narrative (SEI / PN1 / PN2). Single row per month, even if
      // the client has multiple of them; UPI flag set if SEI is among them.
      for (const p of monthly) {
        const active = startedByPeriodEnd(monthlyNarrativeEntries, p.period_end);
        if (active.length === 0) continue;
        const services = [...new Set(active.map((e) => e.code))];
        inserts.push({
          organization_id: data.organizationId,
          client_id: clientId,
          period_kind: p.period_kind,
          period_label: p.period_label,
          period_start: p.period_start,
          period_end: p.period_end,
          due_date: p.due_date,
          service_codes: services,
          requires_upi_attestation: active.some((e) => e.code === "SEI"),
          summary_kind: "narrative",
          include_goal_progress: clientNeedsGoalProgress(services),
        });
      }

      // Monthly financial statement (PBA). Separate row with a distinct label
      // suffix so it does not collide with a co-existing narrative monthly row.
      for (const p of monthly) {
        const active = startedByPeriodEnd(monthlyFinancialEntries, p.period_end);
        if (active.length === 0) continue;
        const services = [...new Set(active.map((e) => e.code))];
        inserts.push({
          organization_id: data.organizationId,
          client_id: clientId,
          period_kind: p.period_kind,
          period_label: `${p.period_label}-FS`,
          period_start: p.period_start,
          period_end: p.period_end,
          due_date: p.due_date,
          service_codes: services,
          requires_upi_attestation: false,
          summary_kind: "financial_statement",
          include_goal_progress: false,
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

/** List all open summaries for the org.
 *
 * "Open" = not yet completed, OR a UPI-attestation-required summary that has
 * been finalized but not yet attested as entered into the state UPI portal.
 * This keeps the SEI "Entered into UPI" deadline visible after finalize, so
 * finalizing in the Summaries portal does not hide the still-required UPI
 * attestation step on the Deadlines page. */
export const listOpenSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("client_progress_summaries")
      .select(SUMMARY_SELECT)
      .eq("organization_id", data.organizationId)
      .or("completed_at.is.null,and(requires_upi_attestation.eq.true,upi_entered_at.is.null)")
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProgressSummaryRow[];
  });


/** List ALL summaries (open + finalized) for the org — admin Summaries page. */
export const listAllSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("client_progress_summaries")
      .select(SUMMARY_SELECT)
      .eq("organization_id", data.organizationId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProgressSummaryRow[];
  });

/** Mark a non-SEI summary complete (legacy callsite — kept for backward compatibility). */
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
      .update({ completed_at: new Date().toISOString(), completed_by: userId, status: "finalized" })
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
        status: "finalized",
      })
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .eq("requires_upi_attestation", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Source bundle + draft/save/finalize ──────────────────────────────────

export type SummarySourceBundle = {
  summary: ProgressSummaryRow;
  client: { id: string; first_name: string; last_name: string; pcsp_goals: string[] };
  servicesInPeriod: Array<{ service_code: string; service_start_date: string | null; service_end_date: string | null }>;
  dailyLogs: Array<{
    id: string;
    log_date: string;
    narrative: string;
    pcsp_goals_addressed: string[];
    staff_name: string | null;
    approved_at: string | null;
  }>;
  shiftReports: Array<{
    id: string;
    created_at: string;
    narrative: string | null;
    staff_name: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    goals_worked: any;
  }>;
  incidents: Array<{
    id: string;
    report_number: string;
    incident_date: string;
    incident_types: string[];
    narrative_before: string;
    narrative_during: string;
    narrative_after: string;
  }>;
};

export const getSummaryWithSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }): Promise<SummarySourceBundle> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: summary, error: sErr } = await (supabase as any)
      .from("client_progress_summaries")
      .select(SUMMARY_SELECT)
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!summary) throw new Error("Summary not found");

    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, pcsp_goals")
      .eq("id", summary.client_id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: services, error: svcErr } = await supabase
      .from("client_billing_codes")
      .select("service_code, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summary.client_id);
    if (svcErr) throw new Error(svcErr.message);
    const inPeriod = (services ?? []).filter((s) => {
      const startOk = !s.service_start_date || s.service_start_date <= summary.period_end;
      const endOk = !s.service_end_date || s.service_end_date >= summary.period_start;
      return startOk && endOk;
    });

    const { data: logs, error: lErr } = await supabase
      .from("daily_logs")
      .select("id, log_date, narrative, pcsp_goals_addressed, user_id, approved_at")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summary.client_id)
      .eq("status", "approved")
      .gte("log_date", summary.period_start)
      .lte("log_date", summary.period_end)
      .order("log_date", { ascending: true });
    if (lErr) throw new Error(lErr.message);

    const { data: reports, error: rErr } = await supabase
      .from("shift_reports")
      .select("id, created_at, narrative, staff_id, goals_worked, submitted_at")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summary.client_id)
      .gte("created_at", `${summary.period_start}T00:00:00`)
      .lte("created_at", `${summary.period_end}T23:59:59`)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const { data: incidents, error: iErr } = await supabase
      .from("incident_reports")
      .select("id, report_number, incident_date, incident_types, narrative_before, narrative_during, narrative_after")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summary.client_id)
      .gte("incident_date", summary.period_start)
      .lte("incident_date", summary.period_end)
      .order("incident_date", { ascending: true });
    if (iErr) throw new Error(iErr.message);

    // Resolve staff names in bulk.
    const staffIds = new Set<string>();
    for (const l of logs ?? []) if (l.user_id) staffIds.add(l.user_id);
    for (const r of reports ?? []) if (r.staff_id) staffIds.add(r.staff_id);
    const nameById = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", [...staffIds]);
      for (const p of (profs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
        nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "Staff");
      }
    }

    return {
      summary: summary as ProgressSummaryRow,
      client: {
        id: client.id,
        first_name: client.first_name,
        last_name: client.last_name,
        pcsp_goals: (client.pcsp_goals ?? []) as string[],
      },
      servicesInPeriod: inPeriod as SummarySourceBundle["servicesInPeriod"],
      dailyLogs: (logs ?? []).map((l) => ({
        id: l.id,
        log_date: l.log_date,
        narrative: l.narrative,
        pcsp_goals_addressed: (l.pcsp_goals_addressed ?? []) as string[],
        staff_name: l.user_id ? (nameById.get(l.user_id) ?? null) : null,
        approved_at: l.approved_at,
      })),
      shiftReports: (reports ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        narrative: r.narrative,
        staff_name: r.staff_id ? (nameById.get(r.staff_id) ?? null) : null,
        goals_worked: r.goals_worked,
      })),
      incidents: (incidents ?? []) as SummarySourceBundle["incidents"],
    };
  });

export const saveSummaryDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
    content: z.string().max(50_000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({ draft_content: data.content, status: "in_review", updated_at: new Date().toISOString() })
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .is("completed_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
    content: z.string().min(1).max(50_000),
    finalizedByName: z.string().min(1).max(200),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const ts = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update({
        final_content: data.content,
        finalized_at: ts,
        finalized_by: userId,
        finalized_by_name: data.finalizedByName,
        completed_at: ts,
        completed_by: userId,
        status: "finalized",
      })
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { SummaryPeriod };
