// Server-fn wrapper for the Financial → RHS tab.
//
// Mirrors the TNS Gross / Totals / Host Home / Contractors pattern:
// each read first enforces `view_financial_rhs` via requirePermission(),
// then runs the same query the route previously executed in the browser,
// using the USER-SCOPED context.supabase from requireSupabaseAuth.
// RLS still applies as the user. No supabaseAdmin. No RLS changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "@/lib/require-permission";

const PERM = "view_financial_rhs";

const OrgInput = z.object({ organizationId: z.string().uuid() });
const OrgClientsInput = z.object({
  organizationId: z.string().uuid(),
  clientIds: z.array(z.string().uuid()),
});
const OrgMonthRangeInput = z.object({
  organizationId: z.string().uuid(),
  monthStartIso: z.string(),
  monthEndIso: z.string(),
});

export type RhsCode = {
  client_id: string;
  rate_per_unit: number;
  service_start_date: string | null;
  service_end_date: string | null;
};
export type RhsClient = { id: string; first_name: string; last_name: string };
export type RhsDaysMap = Record<string, number>;

async function gate(context: { supabase: unknown; userId: string }, organizationId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await requirePermission(context.supabase as any, context.userId, organizationId, PERM);
}

export const getRhsCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<RhsCode[]> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("client_billing_codes")
      .select("client_id, rate_per_unit, service_start_date, service_end_date")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "RHS");
    if (error) throw error;
    // Only authorizations whose window overlaps the requested month —
    // otherwise a code that hasn't started yet or already ended keeps
    // showing on the RHS page (and, worse, can win the rate lookup below
    // over the authorization actually in force for that month).
    return ((rows ?? []) as RhsCode[]).filter((r) => {
      const startOk = !r.service_start_date || r.service_start_date < data.monthEndIso;
      const endOk = !r.service_end_date || r.service_end_date >= data.monthStartIso;
      return startOk && endOk;
    });
  });

export const getRhsClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgClientsInput.parse(i))
  .handler(async ({ data, context }): Promise<RhsClient[]> => {
    await gate(context, data.organizationId);
    if (data.clientIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, first_name, last_name")
      .in("id", data.clientIds)
      .order("last_name");
    if (error) throw error;
    return (rows ?? []) as RhsClient[];
  });

export const getRhsDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgMonthRangeInput.parse(i))
  .handler(async ({ data, context }): Promise<RhsDaysMap> => {
    await gate(context, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("hhs_daily_records_v")
      .select("client_id, record_date, billable, service_code")
      .eq("organization_id", data.organizationId)
      .eq("service_code", "RHS")
      .gte("record_date", data.monthStartIso)
      .lt("record_date", data.monthEndIso);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const r of (rows ?? []) as Array<{ client_id: string; billable: boolean }>) {
      if (r.billable) counts[r.client_id] = (counts[r.client_id] ?? 0) + 1;
    }
    return counts;
  });
