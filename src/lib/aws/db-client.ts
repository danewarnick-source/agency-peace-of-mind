/**
 * Browser `{ from, rpc }` client. POSTs the query plan to /api/aws/db.
 * Server-side trusted execution lives in db-client.server.ts so `pg` / Cognito
 * never enter the browser bundle.
 */

import {
  createQueryBuilder,
  createRpcBuilder,
  type DbPlan,
  type ExecResult,
  type PlanExecutor,
} from "./query-builder";
import { readBrowserSession } from "./session-store";

async function clientExec(plan: DbPlan): Promise<ExecResult> {
  const session = readBrowserSession();
  const token = session?.access_token;
  const res = await fetch("/api/aws/db", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: "same-origin",
    body: JSON.stringify(plan),
  });
  const json = (await res.json().catch(() => null)) as ExecResult | null;
  if (!json) {
    return {
      data: null,
      error: { message: `AWS data request failed (${res.status})` },
      count: null,
      status: res.status,
      statusText: res.statusText,
    };
  }
  return json;
}

const exec: PlanExecutor = clientExec;

export function createAwsDataClient() {
  return {
    from: (table: string) => createQueryBuilder(table, exec),
    rpc: (fn: string, args?: Record<string, unknown>) => createRpcBuilder(fn, args, exec),
  };
}

let _client: ReturnType<typeof createAwsDataClient> | null = null;
export function getAwsDataClient() {
  if (!_client) _client = createAwsDataClient();
  return _client;
}
