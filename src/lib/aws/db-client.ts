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
import { AWS_DB_ERROR_EVENT, isAwsDbLogical5xx } from "./exec-http";
import { readBrowserSession } from "./session-store";

function notifyAwsDbError(message: string, status: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AWS_DB_ERROR_EVENT, { detail: { message, status } }));
}

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
  const json = (await res.json().catch(() => null)) as
    | (ExecResult & { unhandled?: boolean; message?: string })
    | null;
  if (!json) {
    const fallback: ExecResult = {
      data: null,
      error: { message: `AWS data request failed (${res.status})` },
      count: null,
      status: res.status || 500,
      statusText: res.statusText,
    };
    notifyAwsDbError(fallback.error!.message, fallback.status);
    return fallback;
  }
  const status = json.status || res.status;
  const message =
    json.error?.message || json.message || res.statusText || "AWS data request failed";
  if (isAwsDbLogical5xx({ ...json, status }) || res.status >= 500) {
    notifyAwsDbError(message, status >= 500 ? status : 500);
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
