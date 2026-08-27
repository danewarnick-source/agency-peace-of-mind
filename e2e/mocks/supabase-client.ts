/**
 * In-memory Supabase stub used only when VITE_E2E_HARNESS=1.
 * Selects return fixtures. Inserts/updates/deletes are rejected so tests
 * cannot write True North production timesheets.
 */
import { ALL_PERMISSIONS } from "../../src/lib/rbac";
import {
  ALL_TIMESHEETS,
  APPROVED_LOCATIONS,
  BILLING_CODES,
  CLIENTS,
  DIRECTORY,
  EXPORT_BATCHES,
  EXPORT_RECORDS,
  FAKE_SESSION,
  FAKE_USER,
  MEMBERSHIP,
  ORG_ID,
  ORGANIZATION,
  PROFILE,
  TEAMS,
  USER_ID,
} from "../fixtures/compliance-desk";

type Filter = { op: string; col: string; val?: unknown; extra?: unknown };

function valOf(row: Record<string, unknown>, col: string): unknown {
  if (col.includes(".")) {
    const [a, b] = col.split(".");
    const nested = row[a];
    if (nested && typeof nested === "object") return (nested as Record<string, unknown>)[b];
  }
  return row[col];
}

function applyFilters(rows: Record<string, unknown>[], filters: Filter[]): Record<string, unknown>[] {
  return rows.filter((row) => {
    for (const f of filters) {
      const v = valOf(row, f.col);
      if (f.op === "eq" && v !== f.val) return false;
      if (f.op === "neq" && v === f.val) return false;
      if (f.op === "in") {
        const arr = (f.val as unknown[]) ?? [];
        if (!arr.includes(v)) return false;
      }
      if (f.op === "gte" && String(v ?? "") < String(f.val ?? "")) return false;
      if (f.op === "lte" && String(v ?? "") > String(f.val ?? "")) return false;
      if (f.op === "gt" && String(v ?? "") <= String(f.val ?? "")) return false;
      if (f.op === "lt" && String(v ?? "") >= String(f.val ?? "")) return false;
      if (f.op === "is") {
        if (f.val === null) {
          if (v !== null && v !== undefined) return false;
        }
      }
      if (f.op === "not") {
        // .not(col, "is", null) → keep rows where col is not null
        if (f.val === "is" && (f.extra === null || f.extra === "null")) {
          if (v === null || v === undefined) return false;
        }
      }
    }
    return true;
  });
}

function tableRows(table: string): Record<string, unknown>[] {
  switch (table) {
    case "evv_timesheets":
      return ALL_TIMESHEETS as unknown as Record<string, unknown>[];
    case "teams":
      return TEAMS as unknown as Record<string, unknown>[];
    case "organization_members":
      return [MEMBERSHIP as unknown as Record<string, unknown>];
    case "organizations":
      return [ORGANIZATION as unknown as Record<string, unknown>];
    case "org_member_directory":
      return DIRECTORY as unknown as Record<string, unknown>[];
    case "profiles":
      return [PROFILE as unknown as Record<string, unknown>];
    case "role_permissions":
      return ALL_PERMISSIONS.map((permission) => ({
        organization_id: ORG_ID,
        role: "admin",
        permission,
        enabled: true,
      }));
    case "user_permission_overrides":
      return [];
    case "evv_export_records":
      return EXPORT_RECORDS as unknown as Record<string, unknown>[];
    case "evv_export_batches":
      return EXPORT_BATCHES as unknown as Record<string, unknown>[];
    case "client_approved_locations":
      return APPROVED_LOCATIONS as unknown as Record<string, unknown>[];
    case "client_billing_codes":
      return BILLING_CODES as unknown as Record<string, unknown>[];
    case "clients":
      return CLIENTS as unknown as Record<string, unknown>[];
    case "nectar_documents":
    case "policy_signatures":
    case "auditor_accounts":
    case "hive_executives":
    case "org_subscriptions":
    case "hhs_daily_records_v":
    case "host_supervision_contacts":
    case "incidents":
    case "daily_logs":
      return [];
    default:
      return [];
  }
}

const WRITE_BLOCK = {
  message: "e2e: writes blocked (fixture harness — no live timesheet mutation)",
  code: "E2E_WRITE_BLOCKED",
};

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "insert" | "delete" | "upsert" = "select";
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(private table: string) {}

  select(_cols?: unknown, _opts?: unknown) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ op: "gt", col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ op: "is", col, val });
    return this;
  }
  not(col: string, op: string, val: unknown) {
    this.filters.push({ op: "not", col, val: op, extra: val });
    return this;
  }
  or(_expr: string) {
    return this;
  }
  ilike(_col: string, _val: string) {
    return this;
  }
  filter(col: string, op: string, val: unknown) {
    this.filters.push({ op, col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(_from: number, _to: number) {
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  update(_payload: unknown) {
    this.mode = "update";
    return this;
  }
  insert(_payload: unknown) {
    this.mode = "insert";
    return this;
  }
  upsert(_payload: unknown) {
    this.mode = "upsert";
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  private execute(): { data: unknown; error: unknown; count: number | null } {
    if (this.mode !== "select") {
      return { data: null, error: WRITE_BLOCK, count: null };
    }
    let rows = applyFilters(tableRows(this.table), this.filters);
    if (this.orderCol) {
      const col = this.orderCol;
      const asc = this.orderAsc;
      rows = [...rows].sort((a, b) => {
        const av = String(valOf(a, col) ?? "");
        const bv = String(valOf(b, col) ?? "");
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.wantSingle || this.wantMaybeSingle) {
      return { data: rows[0] ?? null, error: null, count: rows.length };
    }
    return { data: rows, error: null, count: rows.length };
  }

  then<TResult1 = { data: unknown; error: unknown; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

const listeners = new Set<(event: string, session: typeof FAKE_SESSION | null) => void>();

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: FAKE_SESSION }, error: null }),
    getUser: async () => ({ data: { user: FAKE_USER }, error: null }),
    onAuthStateChange: (cb: (event: string, session: typeof FAKE_SESSION | null) => void) => {
      listeners.add(cb);
      cb("SIGNED_IN", FAKE_SESSION);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(cb);
            },
          },
        },
      };
    },
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { session: FAKE_SESSION, user: FAKE_USER }, error: null }),
  },
  from: (table: string) => new QueryBuilder(table),
  rpc: async () => ({ data: null, error: null }),
  channel: () => ({
    on: function on() {
      return this;
    },
    subscribe: () => ({ unsubscribe() {} }),
  }),
  removeChannel: () => {},
};

void USER_ID;
void FAKE_USER;
