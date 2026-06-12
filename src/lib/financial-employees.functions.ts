// Server-fn wrapper for the Financial → Employees tab.
//
// Mirrors the Contractors / Host Home / Totals pattern: each read first
// enforces `view_financial_employees` via requirePermission(), then runs
// the same query the route previously executed in the browser, using the
// USER-SCOPED context.supabase from requireSupabaseAuth. RLS still
// applies as the user. No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_employees";

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

export type EmpEvvUnits = Record<string, number>;
export type EmpHhpMap = Record<string, string[]>;
export type EmpHostRateMap = Record<string, number>;
export type EmpHhsDaysMap = Record<string, number>;
export type EmpClientMap = Record<string, string>;
export type EmpProfileLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  hourly_rate: number | null;
  worker_type: string | null;
};
export type EmpInputsMap = Record<string, number>;

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getEmpEvv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpEvvUnits> => {
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

export const getEmpHhp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpHhpMap> => {
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

export const getEmpHostSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpHostRateMap> => {
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

export const getEmpHhsDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthDateRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpHhsDaysMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
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

export const getEmpClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpClientMap> => {
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

export const getEmpStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpProfileLite[]> => {
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
      .select("id, first_name, last_name, full_name, hourly_rate, worker_type")
      .in("id", ids)
      .eq("worker_type", "w2");
    if (error) throw error;
    return (rows ?? []) as EmpProfileLite[];
  });

export const getEmpInputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthInput.parse(i))
  .handler(async ({ data, context }): Promise<EmpInputsMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("contractor_monthly_pay")
      .select("staff_id, additional_pay")
      .eq("organization_id", data.organizationId)
      .eq("year", data.year)
      .eq("month", data.month);
    if (error) throw error;
    const map: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ staff_id: string; additional_pay: number }>) {
      map[r.staff_id] = Number(r.additional_pay) || 0;
    }
    return map;
  });
