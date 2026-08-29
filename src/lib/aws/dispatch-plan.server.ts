import { getDatabaseUrl } from "./env";
import { executePlan } from "./execute.server";
import { executePlanViaSupabase } from "./execute-via-supabase.server";
import type { DbPlan, ExecResult } from "./query-builder";

export async function dispatchPlan(plan: DbPlan): Promise<ExecResult> {
  if (getDatabaseUrl()) return executePlan(plan);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return executePlanViaSupabase(plan, supabaseAdmin);
}
