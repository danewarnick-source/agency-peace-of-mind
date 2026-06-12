// Server-fn wrapper for the Financial → TNS Gross tab.
//
// Moves the 5 raw reads (client_billing_codes, evv_timesheets, hhs_daily_records_v,
// contractor_monthly_pay, provider_ledger_entries) behind a server boundary that
// FIRST enforces `view_financial_tns_gross` via has_permission(). The reads use
// the USER-SCOPED supabase client from requireSupabaseAuth — RLS still applies
// as the user (defense in depth). No supabaseAdmin, no RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_tns_gross";

const Input = z.object({
  organizationId: z.string().uuid(),
  startYear: z.number().int().min(2000).max(2100),
  endYear: z.number().int().min(2000).max(2100),
});
type Input = z.infer<typeof Input>;

export type GrossCbcRow = { client_id: string; service_code: string; rate_per_unit: number };
export type GrossEvvRow = {
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
};
export type GrossHhsRow = { client_id: string; record_date: string; billable: boolean };
export type GrossLedgerRow = {
  period_year: number;
  period_month: number;
  category: string;
  label: string;
  amount: number;
};
export type GrossCtrRow = { year: number; month: number; net_pay: number; additional_pay: number };

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getGrossCbc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<GrossCbcRow[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("client_id, service_code, rate_per_unit")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return (rows ?? []) as GrossCbcRow[];
  });

export const getGrossEvv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<GrossEvvRow[]> => {
    await gate(context, data.organizationId);
    const rangeStartIso = new Date(data.startYear, 0, 1).toISOString();
    const rangeEndIso = new Date(data.endYear + 1, 0, 1).toISOString();
    const { data: rows, error } = await context.supabase
      .from("evv_timesheets")
      .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
      .eq("organization_id", data.organizationId)
      .gte("clock_in_timestamp", rangeStartIso)
      .lt("clock_in_timestamp", rangeEndIso);
    if (error) throw error;
    return (rows ?? []) as GrossEvvRow[];
  });

export const getGrossHhs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<GrossHhsRow[]> => {
    await gate(context, data.organizationId);
    const rangeStartDate = `${data.startYear}-01-01`;
    const rangeEndDate = `${data.endYear + 1}-01-01`;
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS")
      .gte("record_date", rangeStartDate)
      .lt("record_date", rangeEndDate);
    if (error) throw error;
    return ((rows ?? []) as Array<GrossHhsRow & { service_code: string }>).filter(
      (r) => r.billable,
    );
  });

export const getGrossCtr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<GrossCtrRow[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("contractor_monthly_pay")
      .select("year, month, net_pay, additional_pay")
      .eq("organization_id", data.organizationId)
      .gte("year", data.startYear)
      .lte("year", data.endYear);
    if (error) throw error;
    return (rows ?? []) as GrossCtrRow[];
  });

export const getGrossLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data, context }): Promise<GrossLedgerRow[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("provider_ledger_entries")
      .select("period_year, period_month, category, label, amount")
      .eq("organization_id", data.organizationId)
      .gte("period_year", data.startYear)
      .lte("period_year", data.endYear)
      .in("category", ["received", "payroll_tax"]);
    if (error) throw error;
    return (rows ?? []) as GrossLedgerRow[];
  });
