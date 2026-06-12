// ============================================================================
// NECTAR Financial — permission-bound financial reporting.
//
// This wrapper does NOT add any new ungated data path. For every financial
// source NECTAR can pull from, this file gates with the EXACT SAME key the
// matching tab wrapper uses:
//
//   monthly_grid  -> view_financial_monthly_grid   (perm)
//   host_home     -> view_financial_host_home      (perm)
//   rhs           -> view_financial_rhs            (perm)
//   contractors   -> view_financial_contractors    (perm)
//   employees     -> view_financial_employees      (perm)
//   totals        -> view_financial_totals         (perm)
//   tns_gross     -> view_financial_tns_gross      (perm)
//   revenue       -> role >= admin                 (matches revenue fn)
//   distributions -> role >= admin                 (HARD lock, never a perm)
//
// If a source's gate throws, that source is reported as DECLINED. NECTAR
// never sees its data, the LLM is told the source is unavailable, and the
// response surface labels it as "no access" — no partial leaks.
//
// All reads use the USER-SCOPED context.supabase from requireSupabaseAuth.
// No supabaseAdmin. No RLS changes. No new tables.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission, requireRoleAtLeast } from "@/lib/require-permission";
import { computeEntryUnits } from "@/lib/billing-units";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

const SOURCES = [
  "revenue",
  "monthly_grid",
  "host_home",
  "rhs",
  "contractors",
  "employees",
  "totals",
  "tns_gross",
  "distributions",
] as const;
export type NectarFinSource = (typeof SOURCES)[number];

export type NectarFinSourceResult = {
  source: NectarFinSource;
  allowed: boolean;
  decline_reason?: string;
  /** Yearly rollup, only present when allowed. */
  data?: Record<string, number | string | null | any[]>;
};

export type NectarFinReport = {
  year: number;
  question: string;
  requested: NectarFinSource[];
  sources: NectarFinSourceResult[];
  /** LLM-composed answer that uses ONLY the allowed source figures. */
  answer: string;
  /** Convenience flag — true when at least one requested source was declined. */
  any_declined: boolean;
};

// ───── Source detection ──────────────────────────────────────────────────────
// Lightweight keyword router. The LLM also receives the full source catalog
// and will not invent figures for sources we did NOT load.
function detectSources(question: string, explicit?: NectarFinSource[]): NectarFinSource[] {
  if (explicit && explicit.length) return Array.from(new Set(explicit));
  const q = question.toLowerCase();
  const picked = new Set<NectarFinSource>();
  if (/revenue|billed|gross|income|earnings/.test(q)) picked.add("revenue");
  if (/host\s*home|hhp|hhs/.test(q)) picked.add("host_home");
  if (/\brhs\b|residential|staffed home/.test(q)) picked.add("rhs");
  if (/contractor|1099|net pay|payroll(?! tax)/.test(q)) picked.add("contractors");
  if (/employee|w-?2|w2|wage|salary/.test(q)) picked.add("employees");
  if (/total|summary|overview|company|p&l|profit|loss|expense|tax/.test(q)) picked.add("totals");
  if (/tns gross|tns_gross|true ?north/.test(q)) picked.add("tns_gross");
  if (/distribution|investor|owner payout|profit share|dividend|partner/.test(q)) {
    picked.add("distributions");
  }
  // Default: if nothing matched, load totals (the broad financial overview).
  if (!picked.size) picked.add("totals");
  return Array.from(picked);
}

// ───── Per-source loaders ────────────────────────────────────────────────────
// Each loader: (1) gates with the same key as the matching tab wrapper,
// (2) runs a small yearly rollup using the user-scoped supabase, (3) returns
// a compact figures object. Errors from the gate become decline_reason.

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function gatePerm(ctx: Ctx, organizationId: string, perm: string) {
  await requirePermission(ctx.supabase, ctx.userId, organizationId, perm);
}
async function gateAdmin(ctx: Ctx, organizationId: string) {
  await requireRoleAtLeast(ctx.supabase, ctx.userId, organizationId, "admin");
}

const HHS_CODES = new Set(["HHS"]);

async function loadRateMap(ctx: Ctx, organizationId: string): Promise<Record<string, number>> {
  const { data, error } = await ctx.supabase
    .from("client_billing_codes")
    .select("client_id, service_code, rate_per_unit")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const m: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ client_id: string; service_code: string; rate_per_unit: number }>) {
    m[`${r.client_id}|${r.service_code}`] = Number(r.rate_per_unit) || 0;
  }
  return m;
}

async function loadEvv(ctx: Ctx, organizationId: string, year: number) {
  const yearStartIso = new Date(year, 0, 1).toISOString();
  const yearEndIso = new Date(year + 1, 0, 1).toISOString();
  const { data, error } = await ctx.supabase
    .from("evv_timesheets")
    .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, review_status, corrected_clock_in, corrected_clock_out")
    .eq("organization_id", organizationId)
    .gte("clock_in_timestamp", yearStartIso)
    .lt("clock_in_timestamp", yearEndIso);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    client_id: string;
    service_type_code: string;
    clock_in_timestamp: string;
    clock_out_timestamp: string | null;
    review_status: string | null;
    corrected_clock_in: string | null;
    corrected_clock_out: string | null;
  }>;
}

async function loadHhsDays(ctx: Ctx, organizationId: string, year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;
  const { data, error } = await ctx.supabase
    .from("hhs_daily_records_v")
    .select("client_id, record_date, billable, service_code")
    .eq("organization_id", organizationId)
    .eq("service_code", "HHS")
    .gte("record_date", startDate)
    .lt("record_date", endDate);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ client_id: string; billable: boolean }>).filter((r) => r.billable);
}

async function loadCtr(ctx: Ctx, organizationId: string, year: number) {
  const { data, error } = await ctx.supabase
    .from("contractor_monthly_pay")
    .select("staff_id, year, month, net_pay, additional_pay, tax_federal, tax_state, tax_fica")
    .eq("organization_id", organizationId)
    .eq("year", year);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    staff_id: string;
    month: number;
    net_pay: number | null;
    additional_pay: number | null;
    tax_federal: number | null;
    tax_state: number | null;
    tax_fica: number | null;
  }>;
}

async function w2StaffIds(ctx: Ctx, organizationId: string): Promise<Set<string>> {
  // Mirror the employees wrapper: only profiles flagged as w-2 / employee.
  const { data } = await ctx.supabase
    .from("organization_members")
    .select("user_id, employment_type")
    .eq("organization_id", organizationId);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ user_id: string; employment_type: string | null }>) {
    if ((r.employment_type ?? "").toLowerCase().includes("w2") ||
        (r.employment_type ?? "").toLowerCase().includes("w-2") ||
        (r.employment_type ?? "").toLowerCase() === "employee") {
      set.add(r.user_id);
    }
  }
  return set;
}

function sumEvvBilled(
  rows: Awaited<ReturnType<typeof loadEvv>>,
  rates: Record<string, number>,
): number {
  let billed = 0;
  for (const t of rows) {
    if (HHS_CODES.has(t.service_type_code)) continue;
    const units = computeBillableEntryUnits(t);
    billed += units * (rates[`${t.client_id}|${t.service_type_code}`] ?? 0);
  }
  return billed;
}

function sumHhsBilled(rows: Awaited<ReturnType<typeof loadHhsDays>>, rates: Record<string, number>): number {
  const dayCount: Record<string, number> = {};
  for (const d of rows) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
  let billed = 0;
  for (const [cid, days] of Object.entries(dayCount)) {
    billed += days * (rates[`${cid}|HHS`] ?? 0);
  }
  return billed;
}

async function loadRevenue(ctx: Ctx, organizationId: string, year: number) {
  const [rates, evv, hhs] = await Promise.all([
    loadRateMap(ctx, organizationId),
    loadEvv(ctx, organizationId, year),
    loadHhsDays(ctx, organizationId, year),
  ]);
  const evvBilled = sumEvvBilled(evv, rates);
  const hhsBilled = sumHhsBilled(hhs, rates);
  return {
    billed_dsp: round2(evvBilled),
    billed_hhs: round2(hhsBilled),
    billed_total: round2(evvBilled + hhsBilled),
    evv_entries: evv.length,
    hhs_billable_days: hhs.length,
  };
}

async function loadHostHome(ctx: Ctx, organizationId: string, year: number) {
  const [hhs, rates] = await Promise.all([
    loadHhsDays(ctx, organizationId, year),
    loadRateMap(ctx, organizationId),
  ]);
  const dayCount: Record<string, number> = {};
  for (const d of hhs) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
  let billed = 0;
  for (const [cid, days] of Object.entries(dayCount)) {
    billed += days * (rates[`${cid}|HHS`] ?? 0);
  }
  return {
    billable_days: hhs.length,
    distinct_clients: Object.keys(dayCount).length,
    billed_total: round2(billed),
  };
}

async function loadRhs(ctx: Ctx, organizationId: string, year: number) {
  // RHS is a daily-rate service code. Reuse hhs_daily_records_v with code=RHS.
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;
  const { data, error } = await ctx.supabase
    .from("hhs_daily_records_v")
    .select("client_id, record_date, billable, service_code")
    .eq("organization_id", organizationId)
    .eq("service_code", "RHS")
    .gte("record_date", startDate)
    .lt("record_date", endDate);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Array<{ client_id: string; billable: boolean }>).filter((r) => r.billable);
  const rates = await loadRateMap(ctx, organizationId);
  const dayCount: Record<string, number> = {};
  for (const d of rows) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
  let billed = 0;
  for (const [cid, days] of Object.entries(dayCount)) {
    billed += days * (rates[`${cid}|RHS`] ?? 0);
  }
  return {
    billable_days: rows.length,
    distinct_clients: Object.keys(dayCount).length,
    billed_total: round2(billed),
  };
}

async function loadContractors(ctx: Ctx, organizationId: string, year: number) {
  const rows = await loadCtr(ctx, organizationId, year);
  const net = rows.reduce((a, r) => a + Number(r.net_pay || 0), 0);
  const additional = rows.reduce((a, r) => a + Number(r.additional_pay || 0), 0);
  const fed = rows.reduce((a, r) => a + Number(r.tax_federal || 0), 0);
  const state = rows.reduce((a, r) => a + Number(r.tax_state || 0), 0);
  const fica = rows.reduce((a, r) => a + Number(r.tax_fica || 0), 0);
  return {
    net_pay: round2(net),
    additional_pay: round2(additional),
    tax_federal: round2(fed),
    tax_state: round2(state),
    tax_fica: round2(fica),
    grand_total: round2(net + additional + fed + state + fica),
  };
}

async function loadEmployees(ctx: Ctx, organizationId: string, year: number) {
  // W-2 only, gross-only (matches the Employees tab posture).
  const [rows, w2] = await Promise.all([
    loadCtr(ctx, organizationId, year),
    w2StaffIds(ctx, organizationId),
  ]);
  const filtered = rows.filter((r) => w2.has(r.staff_id));
  const additional = filtered.reduce((a, r) => a + Number(r.additional_pay || 0), 0);
  return {
    w2_rows: filtered.length,
    additional_pay: round2(additional),
  };
}

async function loadTotals(ctx: Ctx, organizationId: string, year: number) {
  const [rev, ctr, ledger] = await Promise.all([
    loadRevenue(ctx, organizationId, year),
    loadCtr(ctx, organizationId, year),
    ctx.supabase
      .from("provider_ledger_entries")
      .select("category, label, amount")
      .eq("organization_id", organizationId)
      .eq("period_year", year)
      .then((r: { data: Array<{ category: string; label: string; amount: number }> | null; error: { message: string } | null }) => {
        if (r.error) throw new Error(r.error.message);
        return (r.data ?? []);
      }),
  ]);
  const netPay = ctr.reduce((a, r) => a + Number(r.net_pay || 0), 0);
  const addl = ctr.reduce((a, r) => a + Number(r.additional_pay || 0), 0);
  const fed = ctr.reduce((a, r) => a + Number(r.tax_federal || 0), 0);
  const state = ctr.reduce((a, r) => a + Number(r.tax_state || 0), 0);
  const fica = ctr.reduce((a, r) => a + Number(r.tax_fica || 0), 0);
  const ledgerExpenses = (ledger as Array<{ amount: number }>).reduce((a, l) => a + Number(l.amount || 0), 0);
  const expenses = netPay + addl + fed + state + fica + ledgerExpenses;
  return {
    gross_billed: rev.billed_total,
    contractor_net_pay: round2(netPay),
    additional_pay: round2(addl),
    payroll_tax_federal: round2(fed),
    payroll_tax_state: round2(state),
    fica: round2(fica),
    ledger_expenses: round2(ledgerExpenses),
    total_expenses: round2(expenses),
    net_after_expenses: round2(rev.billed_total - expenses),
  };
}

async function loadTnsGross(ctx: Ctx, organizationId: string, year: number) {
  // TNS Gross == billed gross for the org/year. Same primitives as revenue.
  const rev = await loadRevenue(ctx, organizationId, year);
  return { gross_billed: rev.billed_total };
}

async function loadDistributions(ctx: Ctx, organizationId: string) {
  const { data: plans, error } = await ctx.supabase
    .from("distribution_plans")
    .select("id, name, plan_type, retention_pct, status, is_active, approved_at")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  const list = (plans ?? []) as Array<{
    id: string;
    name: string;
    plan_type: string;
    retention_pct: number;
    status: string;
    is_active: boolean;
    approved_at: string | null;
  }>;
  const active = list.find((p) => p.is_active) ?? null;
  let participants: Array<{ name: string; allocation_pct: number; role_label: string | null }> = [];
  if (active) {
    const { data: parts } = await ctx.supabase
      .from("distribution_plan_participants")
      .select("participant_name, allocation_pct, role_label")
      .eq("plan_id", active.id);
    participants = ((parts ?? []) as Array<{
      participant_name: string;
      allocation_pct: number;
      role_label: string | null;
    }>).map((p) => ({
      name: p.participant_name,
      allocation_pct: Number(p.allocation_pct || 0),
      role_label: p.role_label,
    }));
  }
  return {
    plan_count: list.length,
    approved_count: list.filter((p) => p.status === "approved").length,
    active_plan_name: active?.name ?? null,
    active_plan_type: active?.plan_type ?? null,
    active_retention_pct: active?.retention_pct ?? null,
    // Participant names + percentages are returned only when admin/super_admin
    // gate already passed (this loader is only called after gateAdmin). Manager
    // calls never reach here because the gate threw above.
    active_participants: participants as unknown as any[],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ───── Orchestrator + LLM ────────────────────────────────────────────────────

const Input = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  question: z.string().min(1).max(2000),
  // Optional: caller (UI) can pre-select sources via checkboxes; otherwise
  // we keyword-route. Either way, gates are re-checked per source.
  explicit_sources: z.array(z.enum(SOURCES)).optional(),
});

async function loadSource(
  source: NectarFinSource,
  ctx: Ctx,
  organizationId: string,
  year: number,
): Promise<NectarFinSourceResult> {
  try {
    switch (source) {
      case "revenue":
        await gateAdmin(ctx, organizationId);
        return { source, allowed: true, data: await loadRevenue(ctx, organizationId, year) };
      case "monthly_grid":
        await gatePerm(ctx, organizationId, "view_financial_monthly_grid");
        // Monthly grid is a UI surface; the underlying figures it presents are
        // already covered by revenue + totals. We expose the same yearly
        // rollup here under its own gate so the grid permission alone is
        // enough for NECTAR to discuss it.
        return { source, allowed: true, data: await loadRevenue(ctx, organizationId, year) };
      case "host_home":
        await gatePerm(ctx, organizationId, "view_financial_host_home");
        return { source, allowed: true, data: await loadHostHome(ctx, organizationId, year) };
      case "rhs":
        await gatePerm(ctx, organizationId, "view_financial_rhs");
        return { source, allowed: true, data: await loadRhs(ctx, organizationId, year) };
      case "contractors":
        await gatePerm(ctx, organizationId, "view_financial_contractors");
        return { source, allowed: true, data: await loadContractors(ctx, organizationId, year) };
      case "employees":
        await gatePerm(ctx, organizationId, "view_financial_employees");
        return { source, allowed: true, data: await loadEmployees(ctx, organizationId, year) };
      case "totals":
        await gatePerm(ctx, organizationId, "view_financial_totals");
        return { source, allowed: true, data: await loadTotals(ctx, organizationId, year) };
      case "tns_gross":
        await gatePerm(ctx, organizationId, "view_financial_tns_gross");
        return { source, allowed: true, data: await loadTnsGross(ctx, organizationId, year) };
      case "distributions":
        // HARD lock — never a manager-toggleable permission. Mirrors the
        // distributions tab guard exactly. Managers ALWAYS land in catch.
        await gateAdmin(ctx, organizationId);
        return { source, allowed: true, data: await loadDistributions(ctx, organizationId) };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source, allowed: false, decline_reason: msg };
  }
}

const SYSTEM_PROMPT = [
  "You are NECTAR, the financial reporting voice for HIVE.",
  "You are STRICTLY bound to the figures supplied in this turn.",
  "Rules:",
  "1. Use ONLY the numbers in the supplied source data. NEVER invent or estimate figures.",
  "2. If a source is marked DECLINED, state plainly that the user does not have access to that data and do NOT speculate about its contents. Do not partially leak — no ranges, no guesses, no implied magnitudes.",
  "3. When comparing sources (e.g. revenue vs payroll), only compare across sources that are ALLOWED. If the comparison requires a declined source, say the comparison cannot be completed.",
  "4. Distributions, owner payouts, investor returns, and profit shares are visible ONLY when the distributions source is allowed in this turn. If distributions is declined, refuse to discuss those figures even if asked.",
  "5. Format currency in USD, rounded to whole dollars in prose. Keep answers concise (under ~200 words unless the user asked for a detailed report).",
  "6. End with a one-line 'Sources used:' tag listing the allowed sources you drew from.",
].join("\n");

export const askFinancialNectar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<NectarFinReport> => {
    const ctx: Ctx = { supabase: context.supabase, userId: context.userId };
    const requested = detectSources(data.question, data.explicit_sources);

    const sources = await Promise.all(
      requested.map((s) => loadSource(s, ctx, data.organizationId, data.year)),
    );

    const allowed = sources.filter((s) => s.allowed);
    const declined = sources.filter((s) => !s.allowed);

    const factSheet = {
      year: data.year,
      allowed_sources: allowed.map((s) => ({ source: s.source, data: s.data ?? {} })),
      declined_sources: declined.map((s) => s.source),
    };

    const userMsg = [
      `Question: ${data.question}`,
      "",
      "Source data (JSON):",
      JSON.stringify(factSheet, null, 2),
    ].join("\n");

    let answer = "";
    try {
      const res = await gatewayFetch({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      });
      if (res.ok) {
        const json = await res.json();
        answer = json?.choices?.[0]?.message?.content?.trim?.() ?? "";
      } else {
        const txt = await res.text();
        answer = `NECTAR is temporarily unavailable (status ${res.status}). ${txt.slice(0, 200)}`;
      }
    } catch (err) {
      answer = `NECTAR could not generate a narrative (${err instanceof Error ? err.message : "unknown error"}). The raw figures below are still authoritative.`;
    }

    if (!answer) {
      answer = "NECTAR did not return a narrative. Use the raw figures below.";
    }

    return {
      year: data.year,
      question: data.question,
      requested,
      sources,
      answer,
      any_declined: declined.length > 0,
    };
  });
