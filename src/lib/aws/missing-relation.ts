import type { DbPlan, ExecResult } from "./query-builder";

/** Views that depend on auth schema and may be absent on a raw RDS clone. */
export const DEGRADE_MISSING_SELECT_TABLES = new Set(["org_member_directory"]);

export function isUndefinedTableError(err: unknown, table?: string): boolean {
  const code =
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const isMissing =
    code === "42P01" || /relation ["']?([a-zA-Z0-9_]+)["']? does not exist/i.test(message);
  if (!isMissing) return false;
  if (!table) return true;
  return message.includes(table);
}

export function shouldDegradeMissingSelect(
  plan: Pick<DbPlan, "op" | "table">,
  err: unknown,
): boolean {
  if (plan.op !== "select") return false;
  if (!DEGRADE_MISSING_SELECT_TABLES.has(plan.table)) return false;
  return isUndefinedTableError(err, plan.table);
}

export function emptySelectResult(plan: Pick<DbPlan, "want" | "head">): ExecResult {
  if (plan.head) {
    return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
  }
  if (plan.want === "maybeSingle" || plan.want === "single") {
    return { data: null, error: null, count: 0, status: 200, statusText: "OK" };
  }
  return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
}

/** Optional home-bootstrap upsert: orphan client_id must not 500 the session. */
export const OPTIONAL_CLIENT_FK_TABLES = new Set(["client_progress_summaries"]);

export function isClientProgressClientFkError(err: unknown): boolean {
  const code =
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
      ? (err as { code: string }).code
      : "";
  const constraint =
    err &&
    typeof err === "object" &&
    "constraint" in err &&
    typeof (err as { constraint: unknown }).constraint === "string"
      ? (err as { constraint: string }).constraint
      : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const blob = `${constraint} ${message}`;
  if (!/client_progress_summaries_client_id_fkey/i.test(blob)) return false;
  return code === "23503" || /foreign key constraint/i.test(message);
}

export function shouldNoopOptionalUpsert(
  plan: Pick<DbPlan, "op" | "table">,
  err: unknown,
): boolean {
  if (!OPTIONAL_CLIENT_FK_TABLES.has(plan.table)) return false;
  if (plan.op !== "upsert" && plan.op !== "insert" && plan.op !== "update") return false;
  return isClientProgressClientFkError(err);
}

export function emptyMutationResult(): ExecResult {
  return { data: [], error: null, count: 0, status: 200, statusText: "OK" };
}
