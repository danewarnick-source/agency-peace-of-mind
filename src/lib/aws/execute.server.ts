/**
 * Execute a DbPlan against RDS. Trusted (service-role equivalent) — RLS on
 * RDS is incomplete; callers must already have a verified session.
 */

import { pgQuery } from "./pg.server";
import {
  IDENT_RE,
  limitSql,
  orderSql,
  parseSelectList,
  quoteIdent,
  selectColumnSql,
  whereSql,
  type DbPlan,
  type EmbedSpec,
  type ExecResult,
} from "./query-builder";

type FkRow = {
  from_table: string;
  from_col: string;
  to_table: string;
  to_col: string;
};

const fkCache = new Map<string, FkRow[]>();

async function fksFor(table: string): Promise<FkRow[]> {
  const hit = fkCache.get(table);
  if (hit) return hit;
  const { rows } = await pgQuery<FkRow>(
    `SELECT
        kcu.table_name AS from_table,
        kcu.column_name AS from_col,
        ccu.table_name AS to_table,
        ccu.column_name AS to_col
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND (kcu.table_name = $1 OR ccu.table_name = $1)`,
    [table],
  );
  fkCache.set(table, rows);
  return rows;
}

function assertTable(name: string) {
  if (!IDENT_RE.test(name)) throw new Error(`Invalid table: ${name}`);
}

function asRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") return [payload as Record<string, unknown>];
  return [];
}

function ok(data: unknown, count: number | null, status = 200): ExecResult {
  return { data, error: null, count, status, statusText: "OK" };
}

function fail(message: string, status = 400): ExecResult {
  return { data: null, error: { message }, count: null, status, statusText: "Error" };
}

function shape(plan: DbPlan, rows: Record<string, unknown>[], count: number | null): ExecResult {
  if (plan.head) return ok(null, count ?? rows.length);
  if (plan.want === "maybeSingle") {
    if (rows.length > 1) return fail("JSON object requested, multiple (or no) rows returned", 406);
    return ok(rows[0] ?? null, count ?? rows.length);
  }
  if (plan.want === "single") {
    if (rows.length !== 1) return fail("JSON object requested, multiple (or no) rows returned", 406);
    return ok(rows[0], count ?? 1);
  }
  return ok(rows, count ?? rows.length);
}

async function applyEmbeds(
  table: string,
  rows: Record<string, unknown>[],
  embeds: EmbedSpec[],
): Promise<Record<string, unknown>[]> {
  if (!embeds.length || rows.length === 0) return rows;
  const fks = await fksFor(table);
  for (const embed of embeds) {
    const relatedTable = IDENT_RE.test(embed.alias) ? embed.alias : null;
    if (!relatedTable) continue;
    const hint = embed.hint && IDENT_RE.test(embed.hint) ? embed.hint : null;
    const outgoing = fks.find(
      (f) => f.from_table === table && f.to_table === relatedTable && (!hint || f.from_col === hint),
    );
    const incoming = fks.find(
      (f) => f.to_table === table && f.from_table === relatedTable && (!hint || f.from_col === hint || f.to_col === hint),
    );

    if (outgoing) {
      const ids = [...new Set(rows.map((r) => r[outgoing.from_col]).filter((v) => v != null))];
      const related = await fetchRelated(relatedTable, outgoing.to_col, ids, embed.columns);
      const byId = new Map(related.map((r) => [String(r[outgoing.to_col]), r]));
      for (const row of rows) {
        const key = row[outgoing.from_col];
        row[embed.alias] = key == null ? null : byId.get(String(key)) ?? null;
      }
      if (embed.inner) {
        rows = rows.filter((r) => r[embed.alias] != null);
      }
    } else if (incoming) {
      const ids = [...new Set(rows.map((r) => r[incoming.to_col]).filter((v) => v != null))];
      const related = await fetchRelated(relatedTable, incoming.from_col, ids, embed.columns);
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const r of related) {
        const k = String(r[incoming.from_col]);
        const list = grouped.get(k) ?? [];
        list.push(r);
        grouped.set(k, list);
      }
      for (const row of rows) {
        const key = row[incoming.to_col];
        row[embed.alias] = key == null ? [] : grouped.get(String(key)) ?? [];
      }
      if (embed.inner) {
        rows = rows.filter((r) => Array.isArray(r[embed.alias]) && (r[embed.alias] as unknown[]).length > 0);
      }
    } else if (hint) {
      // No catalog FK — treat hint as a column on this table pointing at related.id
      const ids = [...new Set(rows.map((r) => r[hint]).filter((v) => v != null))];
      const related = await fetchRelated(relatedTable, "id", ids, embed.columns);
      const byId = new Map(related.map((r) => [String(r.id), r]));
      for (const row of rows) {
        const key = row[hint];
        row[embed.alias] = key == null ? null : byId.get(String(key)) ?? null;
      }
    }
  }
  return rows;
}

async function fetchRelated(
  table: string,
  keyCol: string,
  ids: unknown[],
  select: string,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  assertTable(table);
  const cols = selectColumnSql(select);
  const { rows } = await pgQuery(
    `SELECT ${cols} FROM ${quoteIdent(table)} WHERE ${quoteIdent(keyCol)} = ANY($1)`,
    [ids],
  );
  const { embeds } = parseSelectList(select);
  return applyEmbeds(table, rows as Record<string, unknown>[], embeds);
}

export async function executePlan(plan: DbPlan): Promise<ExecResult> {
  try {
    if (plan.op === "rpc") return await execRpc(plan);
    assertTable(plan.table);
    if (plan.op === "select") return await execSelect(plan);
    if (plan.op === "insert") return await execInsert(plan);
    if (plan.op === "update") return await execUpdate(plan);
    if (plan.op === "upsert") return await execUpsert(plan);
    if (plan.op === "delete") return await execDelete(plan);
    return fail(`Unsupported op: ${plan.op}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[aws-db] executePlan", message);
    return fail(message, 500);
  }
}

async function execSelect(plan: DbPlan): Promise<ExecResult> {
  const params: unknown[] = [];
  const where = whereSql(plan, params);
  const order = orderSql(plan);
  const { embeds } = parseSelectList(plan.select);
  const cols = selectColumnSql(plan.select);

  if (plan.count === "exact" && plan.head) {
    const { rows } = await pgQuery<{ c: string }>(
      `SELECT COUNT(*)::int AS c FROM ${quoteIdent(plan.table)}${where}`,
      params,
    );
    return ok(null, Number(rows[0]?.c ?? 0));
  }

  const limit = limitSql(plan, params);
  const { rows } = await pgQuery(
    `SELECT ${cols} FROM ${quoteIdent(plan.table)}${where}${order}${limit}`,
    params,
  );
  let shaped = rows as Record<string, unknown>[];
  shaped = await applyEmbeds(plan.table, shaped, embeds);

  let count: number | null = null;
  if (plan.count === "exact") {
    const countParams: unknown[] = [];
    const countWhere = whereSql(plan, countParams);
    const c = await pgQuery<{ c: string }>(
      `SELECT COUNT(*)::int AS c FROM ${quoteIdent(plan.table)}${countWhere}`,
      countParams,
    );
    count = Number(c.rows[0]?.c ?? 0);
  }
  return shape(plan, shaped, count);
}

async function execInsert(plan: DbPlan): Promise<ExecResult> {
  const rows = asRows(plan.payload);
  if (rows.length === 0) return ok([], 0);
  const keys = Object.keys(rows[0]).filter((k) => IDENT_RE.test(k));
  if (keys.length === 0) return fail("Insert payload has no columns");
  const params: unknown[] = [];
  const valueGroups: string[] = [];
  for (const row of rows) {
    const placeholders: string[] = [];
    for (const k of keys) {
      params.push(row[k] ?? null);
      placeholders.push(`$${params.length}`);
    }
    valueGroups.push(`(${placeholders.join(",")})`);
  }
  const returning = plan.select ? ` RETURNING ${selectColumnSql(plan.select)}` : " RETURNING *";
  const { rows: out } = await pgQuery(
    `INSERT INTO ${quoteIdent(plan.table)} (${keys.map(quoteIdent).join(",")}) VALUES ${valueGroups.join(",")}${returning}`,
    params,
  );
  return shape(plan, out as Record<string, unknown>[], out.length);
}

async function execUpdate(plan: DbPlan): Promise<ExecResult> {
  const row = asRows(plan.payload)[0];
  if (!row) return fail("Update payload required");
  const keys = Object.keys(row).filter((k) => IDENT_RE.test(k));
  if (keys.length === 0) return fail("Update payload has no columns");
  const params: unknown[] = [];
  const sets = keys.map((k) => {
    params.push(row[k] ?? null);
    return `${quoteIdent(k)} = $${params.length}`;
  });
  const where = whereSql(plan, params);
  if (!where) return fail("Refusing to UPDATE without a filter");
  const returning = plan.select ? ` RETURNING ${selectColumnSql(plan.select)}` : " RETURNING *";
  const { rows: out } = await pgQuery(
    `UPDATE ${quoteIdent(plan.table)} SET ${sets.join(",")}${where}${returning}`,
    params,
  );
  return shape(plan, out as Record<string, unknown>[], out.length);
}

async function execUpsert(plan: DbPlan): Promise<ExecResult> {
  const rows = asRows(plan.payload);
  if (rows.length === 0) return ok([], 0);
  const keys = Object.keys(rows[0]).filter((k) => IDENT_RE.test(k));
  const conflict = (plan.onConflict || "id")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => IDENT_RE.test(s));
  if (conflict.length === 0) return fail("Invalid onConflict");
  const params: unknown[] = [];
  const valueGroups: string[] = [];
  for (const row of rows) {
    const placeholders: string[] = [];
    for (const k of keys) {
      params.push(row[k] ?? null);
      placeholders.push(`$${params.length}`);
    }
    valueGroups.push(`(${placeholders.join(",")})`);
  }
  const updateCols = keys.filter((k) => !conflict.includes(k));
  const action = plan.ignoreDuplicates
    ? "DO NOTHING"
    : updateCols.length
      ? `DO UPDATE SET ${updateCols.map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`).join(",")}`
      : "DO NOTHING";
  const returning = plan.select ? ` RETURNING ${selectColumnSql(plan.select)}` : " RETURNING *";
  const { rows: out } = await pgQuery(
    `INSERT INTO ${quoteIdent(plan.table)} (${keys.map(quoteIdent).join(",")}) VALUES ${valueGroups.join(",")} ON CONFLICT (${conflict.map(quoteIdent).join(",")}) ${action}${returning}`,
    params,
  );
  return shape(plan, out as Record<string, unknown>[], out.length);
}

async function execDelete(plan: DbPlan): Promise<ExecResult> {
  const params: unknown[] = [];
  const where = whereSql(plan, params);
  if (!where) return fail("Refusing to DELETE without a filter");
  const returning = plan.select ? ` RETURNING ${selectColumnSql(plan.select)}` : " RETURNING *";
  const { rows: out } = await pgQuery(
    `DELETE FROM ${quoteIdent(plan.table)}${where}${returning}`,
    params,
  );
  return shape(plan, out as Record<string, unknown>[], out.length);
}

async function execRpc(plan: DbPlan): Promise<ExecResult> {
  const fn = plan.rpcFn || plan.table;
  if (!IDENT_RE.test(fn)) return fail(`Invalid function: ${fn}`);
  const args = plan.rpcArgs ?? {};
  const keys = Object.keys(args).filter((k) => IDENT_RE.test(k));
  const params: unknown[] = [];
  const argSql = keys.map((k) => {
    params.push(args[k]);
    return `${quoteIdent(k)} := $${params.length}`;
  });
  const { rows } = await pgQuery(`SELECT * FROM ${quoteIdent(fn)}(${argSql.join(",")})`, params);
  return shape(plan, rows as Record<string, unknown>[], rows.length);
}
