// Server-fn wrapper for the Financial → Totals tab.
//
// Mirrors the TNS Gross pattern: each read first enforces
// `view_financial_totals` via requirePermission(), then runs the same
// query the route previously executed in the browser, using the
// USER-SCOPED context.supabase from requireSupabaseAuth. RLS still
// applies as the user. No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_totals";

const OrgYearInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
});
const OrgInput = z.object({ organizationId: z.string().uuid() });

export type TotalsTps = {
  w2_schedule: string;
  w2_period_anchor: string;
  contractor_schedule: string;
  contractor_period_anchor: string;
} | null;
export type TotalsCbc = { client_id: string; service_code: string; rate_per_unit: number };
export type TotalsEvv = {
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  staff_id: string | null;
};
export type TotalsHhs = { client_id: string; record_date: string; billable: boolean };
export type TotalsHostSet = { client_id: string; host_daily_rate: number };
export type TotalsHhp = { staff_id: string; client_id: string };
export type TotalsCtr = { staff_id: string; year: number; month: number; net_pay: number; additional_pay: number };
export type TotalsProfilesMap = Record<string, number>;
export type TotalsLedgerRow = {
  id: string;
  period_year: number;
  period_month: number;
  category: string;
  label: string;
  amount: number;
  note: string | null;
};

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getTotalsTps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsTps> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("time_pay_settings")
      .select("w2_schedule, w2_period_anchor, contractor_schedule, contractor_period_anchor")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw error;
    return (row ?? null) as TotalsTps;
  });

export const getTotalsCbc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsCbc[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("client_id, service_code, rate_per_unit")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return (rows ?? []) as TotalsCbc[];
  });

export const getTotalsEvv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsEvv[]> => {
    await gate(context, data.organizationId);
    const yearStartIso = new Date(data.year, 0, 1).toISOString();
    const yearEndIso = new Date(data.year + 1, 0, 1).toISOString();
    const { data: rows, error } = await context.supabase
      .from("evv_timesheets")
      .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, staff_id")
      .eq("organization_id", data.organizationId)
      .gte("clock_in_timestamp", yearStartIso)
      .lt("clock_in_timestamp", yearEndIso);
    if (error) throw error;
    return (rows ?? []) as TotalsEvv[];
  });

export const getTotalsHhs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsHhs[]> => {
    await gate(context, data.organizationId);
    const yearStartDate = `${data.year}-01-01`;
    const yearEndDate = `${data.year + 1}-01-01`;
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS")
      .gte("record_date", yearStartDate)
      .lt("record_date", yearEndDate);
    if (error) throw error;
    return ((rows ?? []) as Array<TotalsHhs & { service_code: string }>).filter((r) => r.billable);
  });

export const getTotalsHostSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsHostSet[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("hhs_host_home_settings")
      .select("client_id, host_daily_rate");
    if (error) throw error;
    return (rows ?? []) as TotalsHostSet[];
  });

export const getTotalsHhp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsHhp[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("staff_assignments")
      .select("staff_id, client_id, service_codes")
      .eq("organization_id", data.organizationId)
      .overlaps("service_codes", ["CMP", "CMS"]);
    if (error) throw error;
    return (rows ?? []) as TotalsHhp[];
  });

export const getTotalsCtr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsCtr[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("contractor_monthly_pay")
      .select("staff_id, year, month, net_pay, additional_pay")
      .eq("organization_id", data.organizationId)
      .eq("year", data.year);
    if (error) throw error;
    return (rows ?? []) as TotalsCtr[];
  });

export const getTotalsProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsProfilesMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, hourly_rate");
    if (error) throw error;
    const map: TotalsProfilesMap = {};
    for (const p of (rows ?? []) as Array<{ id: string; hourly_rate: number | null }>) {
      map[p.id] = Number(p.hourly_rate ?? 0);
    }
    return map;
  });

export const getTotalsLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgYearInput.parse(i))
  .handler(async ({ data, context }): Promise<TotalsLedgerRow[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("provider_ledger_entries")
      .select("id, period_year, period_month, category, label, amount, note")
      .eq("organization_id", data.organizationId)
      .eq("period_year", data.year)
      .in("category", ["received", "payroll_tax"]);
    if (error) throw error;
    return (rows ?? []) as TotalsLedgerRow[];
  });
