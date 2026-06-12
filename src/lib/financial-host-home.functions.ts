// Server-fn wrapper for the Financial → Host Home tab.
//
// Mirrors the TNS Gross / Totals pattern: each read first enforces
// `view_financial_host_home` via requirePermission(), then runs the same
// query the route previously ran in the browser, using the USER-SCOPED
// context.supabase from requireSupabaseAuth. RLS still applies as the user.
// No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_host_home";

const OrgInput = z.object({ organizationId: z.string().uuid() });
const OrgMonthInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
const OrgClientsInput = z.object({
  organizationId: z.string().uuid(),
  clientIds: z.array(z.string().uuid()),
});

export type HhHhsCode = { client_id: string; rate_per_unit: number };
export type HhClient = { id: string; first_name: string; last_name: string };
export type HhDayRow = { client_id: string; record_date: string; billable: boolean };
export type HhSettings = { client_id: string; hhp_name: string | null; host_daily_rate: number };
export type HhMonthly = { client_id: string; activities_amount: number; room_and_board_amount: number };

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getHhCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<HhHhsCode[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("client_id, rate_per_unit")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS");
    if (error) throw error;
    return (rows ?? []) as HhHhsCode[];
  });

export const getHhClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgClientsInput.parse(i))
  .handler(async ({ data, context }): Promise<HhClient[]> => {
    await gate(context, data.organizationId);
    if (data.clientIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, first_name, last_name")
      .in("id", data.clientIds)
      .order("last_name");
    if (error) throw error;
    return (rows ?? []) as HhClient[];
  });

export const getHhDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthInput.parse(i))
  .handler(async ({ data, context }): Promise<Record<string, number>> => {
    await gate(context, data.organizationId);
    const monthStart = new Date(data.year, data.month - 1, 1);
    const monthEnd = new Date(data.year, data.month, 1);
    const startIso = monthStart.toISOString().slice(0, 10);
    const endIso = monthEnd.toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS")
      .gte("record_date", startIso)
      .lt("record_date", endIso);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ client_id: string; billable: boolean }>) {
      if (r.billable) counts[r.client_id] = (counts[r.client_id] ?? 0) + 1;
    }
    return counts;
  });

export const getHhSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<HhSettings[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("hhs_host_home_settings")
      .select("client_id, hhp_name, host_daily_rate")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return (rows ?? []) as HhSettings[];
  });

export const getHhMonthly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthInput.parse(i))
  .handler(async ({ data, context }): Promise<HhMonthly[]> => {
    await gate(context, data.organizationId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("hhs_host_home_monthly")
      .select("client_id, activities_amount, room_and_board_amount")
      .eq("organization_id", data.organizationId)
      .eq("year", data.year)
      .eq("month", data.month);
    if (error) throw error;
    return (rows ?? []) as HhMonthly[];
  });
