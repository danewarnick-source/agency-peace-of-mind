/**
 * Server `{ from, rpc }` client. Runs the plan against RDS or supabaseAdmin.
 * Do not import this file from browser modules.
 */

import { dispatchPlan } from "./dispatch-plan.server";
import { createQueryBuilder, createRpcBuilder } from "./query-builder";

export function getAwsDataClient() {
  return {
    from: (table: string) => createQueryBuilder(table, dispatchPlan),
    rpc: (fn: string, args?: Record<string, unknown>) => createRpcBuilder(fn, args, dispatchPlan),
  };
}
