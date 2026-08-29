import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  clientNeedsGoalProgress,
  filterPeriodsByFloor,
  FINANCIAL_STATEMENT_CODES,
  MONTHLY_SUMMARY_CODES,
  QUARTERLY_SUMMARY_CODES,
  recentMonthlyPeriods,
  recentQuarterlyPeriods,
  requiresUpiFiling,
  summaryPeriodFloor,
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
  sc_sent_at: string | null;
  sc_sent_by: string | null;
  ai_review_attested_at: string | null;
  ai_review_attested_by: string | null;
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

const SUMMARY_SELECT_CORE =
  "id, organization_id, client_id, period_kind, period_label, period_start, period_end, due_date, service_codes, requires_upi_attestation, completed_at, completed_by, upi_entered_at, upi_entered_by, summary_kind, status, draft_content, final_content, drafted_at, drafted_by, finalized_at, finalized_by, finalized_by_name, include_goal_progress";

const SUMMARY_SELECT =
  `${SUMMARY_SELECT_CORE}, sc_sent_at, sc_sent_by, ai_review_attested_at, ai_review_attested_by`;

function normalizeSummaryRow(row: Record<string, unknown>): ProgressSummaryRow {
  return {
    ...(row as unknown as ProgressSummaryRow),
    sc_sent_at: (row.sc_sent_at as string | null | undefined) ?? null,
    sc_sent_by: (row.sc_sent_by as string | null | undefined) ?? null,
    ai_review_attested_at: (row.ai_review_attested_at as string | null | undefined) ?? null,
    ai_review_attested_by: (row.ai_review_attested_by as string | null | undefined) ?? null,
  };
}

async function selectSummaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  opts?: { openOnly?: boolean },
): Promise<ProgressSummaryRow[]> {
  let q = supabase
    .from("client_progress_summaries")
    .select(SUMMARY_SELECT)
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: true });
  if (opts?.openOnly) {
    q = q.or(
      [
        "completed_at.is.null",
        "and(requires_upi_attestation.eq.true,upi_entered_at.is.null)",
        "and(requires_upi_attestation.eq.false,sc_sent_at.is.null,status.eq.finalized)",
      ].join(","),
    );
  }
  const { data, error } = await q;
  if (error && /sc_sent_at|ai_review_attested/i.test(error.message)) {
    // Columns not applied yet — degrade to core select + UPI-only open filter.
    let q2 = supabase
      .from("client_progress_summaries")
      .select(SUMMARY_SELECT_CORE)
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: true });
    if (opts?.openOnly) {
      q2 = q2.or("completed_at.is.null,and(requires_upi_attestation.eq.true,upi_entered_at.is.null)");
    }
    const retry = await q2;
    if (retry.error) throw new Error(retry.error.message);
    return ((retry.data ?? []) as Record<string, unknown>[]).map(normalizeSummaryRow);
  }
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSummaryRow);
}

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
    if (!supabase || !userId) return { ensured: 0 };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const today = new Date().toISOString().slice(0, 10);

    // Org-wide floor: a period that closed before this org actually started
    // using HIVE should never be generated. Defaults to created_at when unset.
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("go_live_date, created_at" as any)
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    const org = orgRow as unknown as { go_live_date: string | null; created_at: string } | null;
    const orgGoLiveDate = (org?.go_live_date ?? org?.created_at ?? "").slice(0, 10) || null;

    const { data: codes, error: codesErr } = await supabase
      .from("client_billing_codes")
      .select("client_id, service_code, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId);
    if (codesErr) throw new Error(codesErr.message);

    // Per-client HIVE start (hive_start_date → created_at) for summaryPeriodFloor.
    // hive_start_date is optional until SQL handoff runs; fall back to created_at.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clientRows: Array<{ id: string; hive_start_date: string | null; created_at: string }> | null = null;
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withHive = await (supabase as any)
        .from("clients")
        .select("id, hive_start_date, created_at")
        .eq("organization_id", data.organizationId);
      if (withHive.error && /hive_start_date/i.test(withHive.error.message)) {
        const { data: fallback, error: fbErr } = await supabase
          .from("clients")
          .select("id, created_at")
          .eq("organization_id", data.organizationId);
        if (fbErr) throw new Error(fbErr.message);
        clientRows = (fallback ?? []).map((c) => ({
          id: c.id,
          hive_start_date: null,
          created_at: c.created_at,
        }));
      } else if (withHive.error) {
        throw new Error(withHive.error.message);
      } else {
        clientRows = withHive.data as typeof clientRows;
      }
    }
    const clientMeta = new Map<string, { hive_start_date: string | null; created_at: string }>();
    for (const c of clientRows ?? []) {
      clientMeta.set(c.id, {
        hive_start_date: c.hive_start_date ?? null,
        created_at: c.created_at,
      });
    }

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
    const quarterlyAll = recentQuarterlyPeriods(now);
    const monthlyAll = recentMonthlyPeriods(now);

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
      // Billing rows can outlive a deleted client; skip rather than FK-500
      // the home-load ensure RPC (that JSON 500 used to be HTML-rewritten
      // and hang dashboard Loading).
      if (!clientMeta.has(clientId)) continue;
      const meta = clientMeta.get(clientId);
      const floor = summaryPeriodFloor({
        orgGoLiveDate,
        clientHiveStartDate: meta?.hive_start_date,
        clientCreatedAt: meta?.created_at,
      });
      const quarterly = filterPeriodsByFloor(quarterlyAll, floor);
      const monthly = filterPeriodsByFloor(monthlyAll, floor);

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

      // Monthly narrative (SEI / SJD / PN1 / PN2 / CMP / CMS). Single row per
      // month; UPI flag set if SEI or SJD is among them.
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
          requires_upi_attestation: requiresUpiFiling(services),
          summary_kind: "narrative",
          include_goal_progress: clientNeedsGoalProgress(services),
        });
      }

      // Monthly financial statement (PBA).
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
    if (error) {
      if (/client_progress_summaries_client_id_fkey|foreign key constraint/i.test(error.message)) {
        return { ensured: 0 };
      }
      throw new Error(error.message);
    }
    return { ensured: inserts.length };
  });

/** List all open summaries for the org.
 *
 * "Open" = not yet completed, OR still awaiting a filing attestation:
 *   - UPI-required (SEI/SJD): finalized but upi_entered_at is null
 *   - SC-filed narrative/financial: finalized but sc_sent_at is null
 * This keeps the post-finalize send/UPI step visible on Deadlines. */
export const listOpenSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [] as ProgressSummaryRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    return selectSummaries(supabase, data.organizationId, { openOnly: true });
  });


/** List ALL summaries (open + finalized) for the org — admin Summaries page. */
export const listAllSummaries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [] as ProgressSummaryRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    return selectSummaries(supabase, data.organizationId);
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
    if (!supabase || !userId) return { ok: true };
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

/** Attest that an SEI/SJD monthly summary has been typed into the state UPI system. */
export const attestSummaryUpiEntered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
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

/** Attest that a non-UPI summary PDF was emailed/sent to the Support Coordinator. */
export const attestSummarySentToSc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const ts = new Date().toISOString();
    const patch: Record<string, unknown> = {
      sc_sent_at: ts,
      sc_sent_by: userId,
      completed_at: ts,
      completed_by: userId,
      status: "finalized",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update(patch)
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId)
      .eq("requires_upi_attestation", false);
    if (error && /sc_sent_at/i.test(error.message)) {
      // Column not applied yet — still clear deadline via completed_at.
      delete patch.sc_sent_at;
      delete patch.sc_sent_by;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase as any)
        .from("client_progress_summaries")
        .update(patch)
        .eq("id", data.summaryId)
        .eq("organization_id", data.organizationId)
        .eq("requires_upi_attestation", false));
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Source bundle + draft/save/finalize ──────────────────────────────────

export type SummaryPcspGoal = {
  id: string;
  goal: string;
  job_codes: string[];
};

export type SummarySourceBundle = {
  summary: ProgressSummaryRow;
  client: {
    id: string;
    first_name: string;
    last_name: string;
    pcsp_goals: string[];
    support_coordinator_name: string | null;
    support_coordinator_email: string | null;
    support_coordinator_phone: string | null;
  };
  goals: SummaryPcspGoal[];
  organization: {
    name: string | null;
    legal_name: string | null;
    address: string | null;
    phone: string | null;
    logo_path: string | null;
  };
  staffNames: string[];
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
    service_code: string | null;
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
  untaggedSourceCount: number;
};

export const getSummaryWithSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    organizationId: z.string().uuid(),
    summaryId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }): Promise<SummarySourceBundle> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return null as unknown as SummarySourceBundle;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let summary: Record<string, unknown> | null = null;
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const full = await (supabase as any)
        .from("client_progress_summaries")
        .select(SUMMARY_SELECT)
        .eq("id", data.summaryId)
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      if (full.error && /sc_sent_at|ai_review_attested/i.test(full.error.message)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const core = await (supabase as any)
          .from("client_progress_summaries")
          .select(SUMMARY_SELECT_CORE)
          .eq("id", data.summaryId)
          .eq("organization_id", data.organizationId)
          .maybeSingle();
        if (core.error) throw new Error(core.error.message);
        summary = core.data as Record<string, unknown> | null;
      } else if (full.error) {
        throw new Error(full.error.message);
      } else {
        summary = full.data as Record<string, unknown> | null;
      }
    }
    if (!summary) throw new Error("Summary not found");
    const summaryRow = normalizeSummaryRow(summary);

    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id, first_name, last_name, pcsp_goals, support_coordinator_name, support_coordinator_email, support_coordinator_phone")
      .eq("id", summaryRow.client_id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: org } = await supabase
      .from("organizations")
      .select("name, legal_name")
      .eq("id", data.organizationId)
      .maybeSingle();
    const { data: branding } = await supabase
      .from("organization_branding")
      .select("logo_path, org_address, org_phone")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // Prefer rich CST goals (with job_codes); fall back to flat pcsp_goals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cst } = await (supabase as any)
      .from("client_specific_trainings")
      .select("goals")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summaryRow.client_id)
      .eq("training_type", "person_specific")
      .maybeSingle();
    const periodCodes = new Set((summaryRow.service_codes ?? []).map((c) => c.toUpperCase()));
    let goals: SummaryPcspGoal[] = [];
    const cstGoals = (cst?.goals ?? null) as Array<{ id?: string; goal?: string; job_codes?: string[] }> | null;
    if (Array.isArray(cstGoals) && cstGoals.length > 0) {
      goals = cstGoals
        .map((g, i) => ({
          id: String(g.id ?? `g-${i}`),
          goal: String(g.goal ?? "").trim(),
          job_codes: (g.job_codes ?? []).map((c) => String(c).toUpperCase()).filter(Boolean),
        }))
        .filter((g) => g.goal.length > 0)
        .filter((g) =>
          g.job_codes.length === 0 || g.job_codes.some((c) => periodCodes.has(c)),
        );
    }
    if (goals.length === 0) {
      goals = ((client.pcsp_goals ?? []) as string[])
        .map((g, i) => ({ id: `flat-${i}`, goal: String(g).trim(), job_codes: [] as string[] }))
        .filter((g) => g.goal.length > 0);
    }

    const { data: services, error: svcErr } = await supabase
      .from("client_billing_codes")
      .select("service_code, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summaryRow.client_id);
    if (svcErr) throw new Error(svcErr.message);
    const inPeriod = (services ?? []).filter((s) => {
      const startOk = !s.service_start_date || s.service_start_date <= summaryRow.period_end;
      const endOk = !s.service_end_date || s.service_end_date >= summaryRow.period_start;
      return startOk && endOk;
    });

    const { data: logs, error: lErr } = await supabase
      .from("daily_logs")
      .select("id, log_date, narrative, pcsp_goals_addressed, user_id, approved_at")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summaryRow.client_id)
      .eq("status", "approved")
      .gte("log_date", summaryRow.period_start)
      .lte("log_date", summaryRow.period_end)
      .order("log_date", { ascending: true });
    if (lErr) throw new Error(lErr.message);

    const { data: reports, error: rErr } = await supabase
      .from("shift_reports")
      .select("id, created_at, narrative, staff_id, goals_worked, submitted_at, scheduled_shift_id")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summaryRow.client_id)
      .gte("created_at", `${summaryRow.period_start}T00:00:00`)
      .lte("created_at", `${summaryRow.period_end}T23:59:59`)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const shiftIds = [...new Set((reports ?? []).map((r) => r.scheduled_shift_id).filter(Boolean))] as string[];
    const shiftCodeById = new Map<string, string>();
    if (shiftIds.length > 0) {
      const { data: shifts } = await supabase
        .from("scheduled_shifts")
        .select("id, service_code")
        .in("id", shiftIds);
      for (const sh of (shifts ?? []) as Array<{ id: string; service_code: string | null }>) {
        if (sh.service_code) shiftCodeById.set(sh.id, sh.service_code.toUpperCase());
      }
    }

    const { data: incidents, error: iErr } = await supabase
      .from("incident_reports")
      .select("id, report_number, incident_date, incident_types, narrative_before, narrative_during, narrative_after")
      .eq("organization_id", data.organizationId)
      .eq("client_id", summaryRow.client_id)
      .gte("incident_date", summaryRow.period_start)
      .lte("incident_date", summaryRow.period_end)
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

    const goalTexts = new Set(goals.map((g) => g.goal.toLowerCase()));
    let untaggedSourceCount = 0;
    const dailyLogs = (logs ?? []).map((l) => {
      const addressed = (l.pcsp_goals_addressed ?? []) as string[];
      if (addressed.length === 0 || !addressed.some((g) => goalTexts.has(String(g).toLowerCase()))) {
        untaggedSourceCount += 1;
      }
      return {
        id: l.id,
        log_date: l.log_date,
        narrative: l.narrative,
        pcsp_goals_addressed: addressed,
        staff_name: l.user_id ? (nameById.get(l.user_id) ?? null) : null,
        approved_at: l.approved_at,
      };
    });

    const shiftReports = (reports ?? []).map((r) => {
      const code = r.scheduled_shift_id ? (shiftCodeById.get(r.scheduled_shift_id) ?? null) : null;
      if (code && periodCodes.size > 0 && !periodCodes.has(code)) {
        // Code-stamped but outside this period's codes — still list for review.
        untaggedSourceCount += 1;
      } else if (!code) {
        untaggedSourceCount += 1;
      }
      return {
        id: r.id,
        created_at: r.created_at,
        narrative: r.narrative,
        staff_name: r.staff_id ? (nameById.get(r.staff_id) ?? null) : null,
        service_code: code,
        goals_worked: r.goals_worked,
      };
    });

    const staffNames = [...new Set([...nameById.values()])].sort();

    return {
      summary: summaryRow,
      client: {
        id: client.id,
        first_name: client.first_name,
        last_name: client.last_name,
        pcsp_goals: (client.pcsp_goals ?? []) as string[],
        support_coordinator_name: client.support_coordinator_name ?? null,
        support_coordinator_email: client.support_coordinator_email ?? null,
        support_coordinator_phone: client.support_coordinator_phone ?? null,
      },
      goals,
      organization: {
        name: org?.name ?? null,
        legal_name: org?.legal_name ?? null,
        address: branding?.org_address ?? null,
        phone: branding?.org_phone ?? null,
        logo_path: branding?.logo_path ?? null,
      },
      staffNames,
      servicesInPeriod: inPeriod as SummarySourceBundle["servicesInPeriod"],
      dailyLogs,
      shiftReports,
      incidents: (incidents ?? []) as SummarySourceBundle["incidents"],
      untaggedSourceCount,
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
    if (!supabase || !userId) return { ok: true };
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
    aiReviewAttested: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return { ok: true };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    if (!data.aiReviewAttested) {
      throw new Error("Confirm you reviewed the Nectar draft against HIVE documentation before finalizing.");
    }
    const ts = new Date().toISOString();

    // Finalize content now; deadline clears only after UPI or SC send attestation.
    // Keep completed_at null so open-list / Deadlines still show the filing step.
    const patch: Record<string, unknown> = {
      final_content: data.content,
      finalized_at: ts,
      finalized_by: userId,
      finalized_by_name: data.finalizedByName,
      ai_review_attested_at: ts,
      ai_review_attested_by: userId,
      completed_at: null,
      completed_by: null,
      status: "finalized",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (supabase as any)
      .from("client_progress_summaries")
      .update(patch)
      .eq("id", data.summaryId)
      .eq("organization_id", data.organizationId);
    if (error && /ai_review_attested/i.test(error.message)) {
      delete patch.ai_review_attested_at;
      delete patch.ai_review_attested_by;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase as any)
        .from("client_progress_summaries")
        .update(patch)
        .eq("id", data.summaryId)
        .eq("organization_id", data.organizationId));
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { SummaryPeriod };
