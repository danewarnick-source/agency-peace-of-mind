/**
 * Run a DbPlan through the existing supabase-js admin client.
 * Used when AUTH_PROVIDER=cognito but DATABASE_URL is unset (Supabase is
 * still the database). Service-role equivalent — same as supabaseAdmin.
 */

import type { DbPlan, ExecResult } from "./query-builder";

type AnyQ = {
  select: (...a: unknown[]) => AnyQ;
  insert: (...a: unknown[]) => AnyQ;
  update: (...a: unknown[]) => AnyQ;
  upsert: (...a: unknown[]) => AnyQ;
  delete: () => AnyQ;
  eq: (c: string, v: unknown) => AnyQ;
  neq: (c: string, v: unknown) => AnyQ;
  gt: (c: string, v: unknown) => AnyQ;
  gte: (c: string, v: unknown) => AnyQ;
  lt: (c: string, v: unknown) => AnyQ;
  lte: (c: string, v: unknown) => AnyQ;
  like: (c: string, v: unknown) => AnyQ;
  ilike: (c: string, v: unknown) => AnyQ;
  is: (c: string, v: unknown) => AnyQ;
  in: (c: string, v: unknown) => AnyQ;
  contains: (c: string, v: unknown) => AnyQ;
  overlaps: (c: string, v: unknown) => AnyQ;
  not: (c: string, op: string, v: unknown) => AnyQ;
  filter: (c: string, op: string, v: unknown) => AnyQ;
  or: (expr: string) => AnyQ;
  order: (c: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => AnyQ;
  limit: (n: number) => AnyQ;
  range: (from: number, to: number) => AnyQ;
  single: () => AnyQ;
  maybeSingle: () => AnyQ;
};

export async function executePlanViaSupabase(
  plan: DbPlan,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
): Promise<ExecResult> {
  try {
    if (plan.op === "rpc") {
      let q = sb.rpc(plan.rpcFn, plan.rpcArgs ?? {});
      q = applyCommon(q, plan);
      const { data, error, count } = await q;
      return pack(data, error, count);
    }

    let q: AnyQ = sb.from(plan.table);
    if (plan.op === "select") {
      q = q.select(plan.select ?? "*", {
        count: plan.count,
        head: plan.head,
      });
    } else if (plan.op === "insert") {
      q = q.insert(plan.payload);
      if (plan.select) q = q.select(plan.select);
    } else if (plan.op === "update") {
      q = q.update(plan.payload);
      if (plan.select) q = q.select(plan.select);
    } else if (plan.op === "upsert") {
      q = q.upsert(plan.payload, {
        onConflict: plan.onConflict,
        ignoreDuplicates: plan.ignoreDuplicates,
      });
      if (plan.select) q = q.select(plan.select);
    } else if (plan.op === "delete") {
      q = q.delete();
      if (plan.select) q = q.select(plan.select);
    }

    q = applyCommon(q, plan);
    const { data, error, count } = await q;
    return pack(data, error, count);
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : String(err) },
      count: null,
      status: 500,
      statusText: "Error",
    };
  }
}

function applyCommon(q: AnyQ, plan: DbPlan): AnyQ {
  let next = q;
  for (const f of plan.filters) {
    if (f.op === "not") next = next.not(f.column, String(f.value), f.extra);
    else if (typeof next[f.op] === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next = (next as any)[f.op](f.column, f.value);
    }
  }
  for (const expr of plan.orExprs) next = next.or(expr);
  for (const o of plan.order) next = next.order(o.column, { ascending: o.ascending, nullsFirst: o.nullsFirst });
  if (plan.limit != null && plan.offset != null) next = next.range(plan.offset, plan.offset + plan.limit - 1);
  else if (plan.limit != null) next = next.limit(plan.limit);
  else if (plan.offset != null) next = next.range(plan.offset, plan.offset + 999);
  if (plan.want === "single") next = next.single();
  if (plan.want === "maybeSingle") next = next.maybeSingle();
  return next;
}

function pack(
  data: unknown,
  error: { message: string } | null,
  count: number | null | undefined,
): ExecResult {
  return {
    data: error ? null : data,
    error: error ? { message: error.message } : null,
    count: count ?? null,
    status: error ? 400 : 200,
    statusText: error ? "Error" : "OK",
  };
}
