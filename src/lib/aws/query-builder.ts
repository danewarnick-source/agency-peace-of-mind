/**
 * Identifier-safe SQL helpers + a supabase-js-shaped thenable query builder.
 * Used on the server against RDS (service-role equivalent) and on the client
 * via POST /api/aws/db so existing `.from().select().eq()` call sites work.
 */

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "contains"
  | "overlaps"
  | "not";

export type Filter = {
  op: FilterOp;
  column: string;
  value?: unknown;
  extra?: unknown;
};

export type OrderBy = { column: string; ascending: boolean; nullsFirst?: boolean };

export type Want = "many" | "single" | "maybeSingle";

export type DbPlan = {
  op: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  table: string;
  select?: string;
  filters: Filter[];
  orExprs: string[];
  order: OrderBy[];
  limit?: number;
  offset?: number;
  want: Want;
  count?: "exact";
  head?: boolean;
  payload?: unknown;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  rpcFn?: string;
  rpcArgs?: Record<string, unknown>;
};

export const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

export function emptyPlan(table: string): DbPlan {
  return {
    op: "select",
    table,
    filters: [],
    orExprs: [],
    order: [],
    want: "many",
  };
}

export type ExecResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

export type PlanExecutor = (plan: DbPlan) => Promise<ExecResult>;

type SelectOpts = { count?: "exact" | "planned" | "estimated"; head?: boolean };

class QueryBuilder implements PromiseLike<ExecResult> {
  private plan: DbPlan;
  private exec: PlanExecutor;

  constructor(plan: DbPlan, exec: PlanExecutor) {
    this.plan = plan;
    this.exec = exec;
  }

  private fork(patch: Partial<DbPlan>): QueryBuilder {
    return new QueryBuilder({ ...this.plan, ...patch, filters: [...this.plan.filters], orExprs: [...this.plan.orExprs], order: [...this.plan.order] }, this.exec);
  }

  select(columns?: string, opts?: SelectOpts) {
    return this.fork({
      op: this.plan.op === "insert" || this.plan.op === "update" || this.plan.op === "upsert" ? this.plan.op : "select",
      select: columns ?? this.plan.select ?? "*",
      count: opts?.count === "exact" ? "exact" : this.plan.count,
      head: opts?.head ?? this.plan.head,
    });
  }

  insert(payload: unknown, opts?: { count?: "exact" }) {
    return this.fork({ op: "insert", payload, count: opts?.count === "exact" ? "exact" : this.plan.count });
  }

  update(payload: unknown) {
    return this.fork({ op: "update", payload });
  }

  upsert(payload: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: "exact" }) {
    return this.fork({
      op: "upsert",
      payload,
      onConflict: opts?.onConflict,
      ignoreDuplicates: opts?.ignoreDuplicates,
      count: opts?.count === "exact" ? "exact" : this.plan.count,
    });
  }

  delete() {
    return this.fork({ op: "delete" });
  }

  eq(column: string, value: unknown) {
    return this.addFilter({ op: "eq", column, value });
  }
  neq(column: string, value: unknown) {
    return this.addFilter({ op: "neq", column, value });
  }
  gt(column: string, value: unknown) {
    return this.addFilter({ op: "gt", column, value });
  }
  gte(column: string, value: unknown) {
    return this.addFilter({ op: "gte", column, value });
  }
  lt(column: string, value: unknown) {
    return this.addFilter({ op: "lt", column, value });
  }
  lte(column: string, value: unknown) {
    return this.addFilter({ op: "lte", column, value });
  }
  like(column: string, value: unknown) {
    return this.addFilter({ op: "like", column, value });
  }
  ilike(column: string, value: unknown) {
    return this.addFilter({ op: "ilike", column, value });
  }
  is(column: string, value: unknown) {
    return this.addFilter({ op: "is", column, value });
  }
  in(column: string, value: unknown) {
    return this.addFilter({ op: "in", column, value });
  }
  contains(column: string, value: unknown) {
    return this.addFilter({ op: "contains", column, value });
  }
  overlaps(column: string, value: unknown) {
    return this.addFilter({ op: "overlaps", column, value });
  }
  not(column: string, op: string, value: unknown) {
    return this.addFilter({ op: "not", column, value: op, extra: value });
  }
  filter(column: string, op: string, value: unknown) {
    return this.addFilter({ op: op as FilterOp, column, value });
  }
  match(obj: Record<string, unknown>) {
    let next: QueryBuilder = this;
    for (const [column, value] of Object.entries(obj)) {
      next = next.eq(column, value);
    }
    return next;
  }
  or(expr: string) {
    const orExprs = [...this.plan.orExprs, expr];
    return new QueryBuilder({ ...this.plan, orExprs, filters: [...this.plan.filters], order: [...this.plan.order] }, this.exec);
  }
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const order = [...this.plan.order, { column, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst }];
    return new QueryBuilder({ ...this.plan, order, filters: [...this.plan.filters], orExprs: [...this.plan.orExprs] }, this.exec);
  }
  limit(n: number) {
    return this.fork({ limit: n });
  }
  range(from: number, to: number) {
    return this.fork({ offset: from, limit: to - from + 1 });
  }
  single() {
    return this.fork({ want: "single" });
  }
  maybeSingle() {
    return this.fork({ want: "maybeSingle" });
  }
  throwOnError() {
    return this;
  }
  returns() {
    return this;
  }

  then<TResult1 = ExecResult, TResult2 = never>(
    onfulfilled?: ((value: ExecResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec(this.plan).then(onfulfilled, onrejected);
  }

  private addFilter(f: Filter): QueryBuilder {
    const filters = [...this.plan.filters, f];
    return new QueryBuilder({ ...this.plan, filters, orExprs: [...this.plan.orExprs], order: [...this.plan.order] }, this.exec);
  }
}

export function createQueryBuilder(table: string, exec: PlanExecutor): QueryBuilder {
  return new QueryBuilder(emptyPlan(table), exec);
}

export function createRpcBuilder(fn: string, args: Record<string, unknown> | undefined, exec: PlanExecutor): QueryBuilder {
  return new QueryBuilder({ ...emptyPlan(fn), op: "rpc", rpcFn: fn, rpcArgs: args ?? {} }, exec);
}

export type EmbedSpec = {
  alias: string;
  hint: string | null;
  inner: boolean;
  columns: string;
};

export function parseSelectList(select: string | undefined): { columns: string[]; embeds: EmbedSpec[] } {
  if (!select || select.trim() === "*") return { columns: ["*"], embeds: [] };
  const parts = splitTop(select, ",");
  const columns: string[] = [];
  const embeds: EmbedSpec[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const paren = part.indexOf("(");
    if (paren === -1) {
      columns.push(part.trim());
      continue;
    }
    const head = part.slice(0, paren).trim();
    const inner = part.slice(paren + 1, part.lastIndexOf(")")).trim();
    let alias = head;
    let hint: string | null = null;
    let isInner = false;
    if (head.includes("!inner")) {
      isInner = true;
      alias = head.replace("!inner", "").replace(/:$/, "");
    }
    if (alias.includes(":")) {
      const [a, h] = alias.split(":");
      alias = a;
      hint = h?.replace(/^!inner/, "") || null;
    }
    embeds.push({ alias: alias.trim(), hint: hint?.trim() || null, inner: isInner, columns: inner || "*" });
  }
  if (columns.length === 0 && embeds.length > 0) columns.push("*");
  return { columns, embeds };
}

export function splitTop(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function filterToSql(f: Filter, params: unknown[]): string {
  const col = qualifyCol(f.column);
  switch (f.op) {
    case "eq":
      params.push(f.value);
      return `${col} = ${p(params)}`;
    case "neq":
      params.push(f.value);
      return `${col} <> ${p(params)}`;
    case "gt":
      params.push(f.value);
      return `${col} > ${p(params)}`;
    case "gte":
      params.push(f.value);
      return `${col} >= ${p(params)}`;
    case "lt":
      params.push(f.value);
      return `${col} < ${p(params)}`;
    case "lte":
      params.push(f.value);
      return `${col} <= ${p(params)}`;
    case "like":
      params.push(f.value);
      return `${col} LIKE ${p(params)}`;
    case "ilike":
      params.push(f.value);
      return `${col} ILIKE ${p(params)}`;
    case "is":
      if (f.value === null || f.value === "null") return `${col} IS NULL`;
      if (f.value === true || f.value === "true") return `${col} IS TRUE`;
      if (f.value === false || f.value === "false") return `${col} IS FALSE`;
      params.push(f.value);
      return `${col} IS ${p(params)}`;
    case "in": {
      const arr = Array.isArray(f.value) ? f.value : [];
      if (arr.length === 0) return "FALSE";
      params.push(arr);
      return `${col} = ANY(${p(params)})`;
    }
    case "contains":
      params.push(typeof f.value === "string" ? f.value : JSON.stringify(f.value));
      return `${col} @> ${p(params)}::jsonb`;
    case "overlaps":
      params.push(f.value);
      return `${col} && ${p(params)}`;
    case "not": {
      const innerOp = String(f.value ?? "eq") as FilterOp;
      const inner = filterToSql({ op: innerOp === "not" ? "eq" : innerOp, column: f.column, value: f.extra }, params);
      return `NOT (${inner})`;
    }
    default:
      throw new Error(`Unsupported filter: ${f.op}`);
  }
}

function qualifyCol(column: string): string {
  if (column.includes(".")) {
    const [a, b] = column.split(".");
    return `${quoteIdent(a)}.${quoteIdent(b)}`;
  }
  return quoteIdent(column);
}

function p(params: unknown[]): string {
  return `$${params.length}`;
}

export function orExprToSql(expr: string, params: unknown[]): string {
  const parts = splitTop(expr, ",");
  const sql: string[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (part.startsWith("and(") && part.endsWith(")")) {
      const inner = splitTop(part.slice(4, -1), ",").map((x) => atomOrGroup(x.trim(), params));
      sql.push(`(${inner.join(" AND ")})`);
      continue;
    }
    if (part.startsWith("or(") && part.endsWith(")")) {
      sql.push(`(${orExprToSql(part.slice(3, -1), params)})`);
      continue;
    }
    sql.push(atomOrGroup(part, params));
  }
  return sql.join(" OR ");
}

function atomOrGroup(part: string, params: unknown[]): string {
  if (part.startsWith("and(") && part.endsWith(")")) {
    const inner = splitTop(part.slice(4, -1), ",").map((x) => atomOrGroup(x.trim(), params));
    return `(${inner.join(" AND ")})`;
  }
  if (part.startsWith("or(") && part.endsWith(")")) {
    return `(${orExprToSql(part.slice(3, -1), params)})`;
  }
  return parseAtom(part, params);
}

function parseAtom(atom: string, params: unknown[]): string {
  const m = /^([a-zA-Z0-9_]+)\.(not\.)?([a-z]+)\.(.*)$/.exec(atom);
  if (!m) throw new Error(`Invalid filter atom: ${atom}`);
  const column = m[1];
  const negated = !!m[2];
  const op = m[3] as FilterOp;
  let value: unknown = m[4];
  if (value === "null") value = null;
  else if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (op === "in" && typeof value === "string" && value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
  } else if (op === "contains" && typeof value === "string" && value.startsWith("{")) {
    value = value;
  }
  const sql = filterToSql({ op, column, value }, params);
  return negated ? `NOT (${sql})` : sql;
}

export function whereSql(plan: DbPlan, params: unknown[]): string {
  const bits: string[] = [];
  for (const f of plan.filters) bits.push(filterToSql(f, params));
  for (const expr of plan.orExprs) bits.push(`(${orExprToSql(expr, params)})`);
  if (bits.length === 0) return "";
  return ` WHERE ${bits.join(" AND ")}`;
}

export function orderSql(plan: DbPlan): string {
  if (!plan.order.length) return "";
  const parts = plan.order.map((o) => {
    const dir = o.ascending ? "ASC" : "DESC";
    const nf = o.nullsFirst === undefined ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
    return `${quoteIdent(o.column)} ${dir}${nf}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

export function limitSql(plan: DbPlan, params: unknown[]): string {
  let sql = "";
  if (plan.limit != null) {
    params.push(plan.limit);
    sql += ` LIMIT ${p(params)}`;
  } else if (plan.want === "single" || plan.want === "maybeSingle") {
    params.push(2);
    sql += ` LIMIT ${p(params)}`;
  }
  if (plan.offset != null) {
    params.push(plan.offset);
    sql += ` OFFSET ${p(params)}`;
  }
  return sql;
}

export function selectColumnSql(select: string | undefined): string {
  const { columns } = parseSelectList(select);
  if (columns.includes("*")) return "*";
  return columns.map((c) => (c === "*" ? "*" : quoteIdent(c))).join(", ");
}
