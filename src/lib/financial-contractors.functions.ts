// Server-fn wrapper for the Financial → Contractors tab.
//
// Mirrors the TNS Gross / Totals / Host Home pattern: each read first enforces
// `view_financial_contractors` via requirePermission(), then runs the same
// query the route previously executed in the browser, using the USER-SCOPED
// context.supabase from requireSupabaseAuth. RLS still applies as the user.
// No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_contractors";

const OrgMonthRangeInput = z.object({
  organizationId: z.string().uuid(),
  monthStartIso: z.string(),
  monthEndIso: z.string(),
});
const OrgMonthDateRangeInput = z.object({
  organizationId: z.string().uuid(),
  monthStartDateIso: z.string(),
  monthEndDateIso: z.string(),
});
const OrgMonthInput = z.object({
  organizationId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
const OrgInput = z.object({ organizationId: z.string().uuid() });

export type CtrEvvUnits = Record<string, number>;
export type CtrHhpMap = Record<string, string[]>;
export type CtrHostRateMap = Record<string, number>;
export type CtrHhsDaysMap = Record<string, number>;
export type CtrClientMap = Record<string, string>;
export type CtrProfileLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  hourly_rate: number | null;
};
export type CtrInputs = {
  staff_id: string;
  additional_pay: number;
  net_pay: number;
  tax_federal: number;
  tax_state: number;
  tax_fica: number;
};

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getCtrEvv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrEvvUnits> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("evv_timesheets")
      .select("staff_id, clock_in_timestamp, clock_out_timestamp")
      .eq("organization_id", data.organizationId)
      .gte("clock_in_timestamp", data.monthStartIso)
      .lt("clock_in_timestamp", data.monthEndIso);
    if (error) throw error;
    const units: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ staff_id: string | null; clock_in_timestamp: string; clock_out_timestamp: string | null }>) {
      if (!r.staff_id) continue;
      const start = new Date(r.clock_in_timestamp).getTime();
      const end = r.clock_out_timestamp ? new Date(r.clock_out_timestamp).getTime() : start;
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      const quarters = Math.round(minutes / 15);
      units[r.staff_id] = (units[r.staff_id] ?? 0) + quarters;
    }
    return units;
  });

export const getCtrHhp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrHhpMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("staff_assignments")
      .select("staff_id, client_id, service_codes")
      .eq("organization_id", data.organizationId)
      .overlaps("service_codes", ["CMP", "CMS"]);
    if (error) throw error;
    const map: Record<string, string[]> = {};
    for (const r of (rows ?? []) as Array<{ staff_id: string; client_id: string }>) {
      (map[r.staff_id] ??= []).push(r.client_id);
    }
    return map;
  });

export const getCtrHostSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrHostRateMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("hhs_host_home_settings")
      .select("client_id, host_daily_rate");
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ client_id: string; host_daily_rate: number }>) {
      map[r.client_id] = Number(r.host_daily_rate) || 0;
    }
    return map;
  });

export const getCtrHhsDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthDateRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrHhsDaysMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, billable, service_code, record_date")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "HHS")
      .gte("record_date", data.monthStartDateIso)
      .lt("record_date", data.monthEndDateIso);
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ client_id: string; billable: boolean }>) {
      if (r.billable) map[r.client_id] = (map[r.client_id] ?? 0) + 1;
    }
    return map;
  });

export const getCtrClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrClientMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, first_name, last_name")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const c of (rows ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
      map[c.id] = `${c.first_name} ${c.last_name}`.trim();
    }
    return map;
  });

export const getCtrStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrProfileLite[]> => {
    await gate(context, data.organizationId);
    const { data: members, error: e1 } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organizationId);
    if (e1) throw e1;
    const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, first_name, last_name, full_name, hourly_rate")
      .in("id", ids);
    if (error) throw error;
    return (rows ?? []) as CtrProfileLite[];
  });

export const getCtrInputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthInput.parse(i))
  .handler(async ({ data, context }): Promise<CtrInputs[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("contractor_monthly_pay")
      .select("staff_id, additional_pay, net_pay, tax_federal, tax_state, tax_fica")
      .eq("organization_id", data.organizationId)
      .eq("year", data.year)
      .eq("month", data.month);
    if (error) throw error;
    return (rows ?? []) as unknown as CtrInputs[];
  });
