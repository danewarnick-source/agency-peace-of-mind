import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only read API: "what rate was in effect for (client, code) on date D?"
 * Returns the current row if D falls in its effective window, otherwise the
 * matching superseded row from client_billing_code_rate_history.
 * Enforced server-side by the SQL function + RLS; staff cannot reach rates.
 */
export const getRateAsOf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; serviceCode: string; asOf: string }) =>
    z.object({
      clientId: z.string().uuid(),
      serviceCode: z.string().min(1),
      asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("get_rate_as_of", {
      _client_id: data.clientId,
      _service_code: data.serviceCode,
      _as_of: data.asOf,
    });
    if (error) throw error;
    const row = (rows ?? [])[0] ?? null;
    return row as null | {
      rate_per_unit: number;
      unit_type: string;
      effective_start: string | null;
      effective_end: string | null;
      rate_source: string | null;
      rate_source_plan_number: string | null;
      source_kind: "current" | "history";
    };
  });

export type RateHistoryRow = {
  id: string;
  rate_per_unit: number;
  unit_type: string;
  effective_start: string | null;
  effective_end: string | null;
  rate_source: string | null;
  rate_source_plan_number: string | null;
  superseded_at: string;
};

/** Admin-only: list prior versions of a (client, service_code) rate. */
export const listRateHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; serviceCode: string }) =>
    z.object({ clientId: z.string().uuid(), serviceCode: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RateHistoryRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("client_billing_code_rate_history")
      .select("id, rate_per_unit, unit_type, effective_start, effective_end, rate_source, rate_source_plan_number, superseded_at")
      .eq("client_id", data.clientId)
      .eq("service_code", data.serviceCode.toUpperCase())
      .order("superseded_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as RateHistoryRow[];
  });
