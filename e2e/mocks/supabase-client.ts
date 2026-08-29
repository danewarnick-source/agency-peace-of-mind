/**
 * In-memory Supabase stub used only when VITE_E2E_HARNESS=1.
 * Selects return fixtures. Inserts/updates/deletes are rejected so tests
 * cannot write True North production timesheets.
 */
import { ALL_PERMISSIONS, DEFAULT_MATRIX, PROVIDER_ROLES, type Permission, type ProviderRole } from "../../src/lib/rbac";
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
import {
  CLIENT_LIST,
  ORG_ID as TNS_ORG_ID,
  ORG_NAME as TNS_ORG_NAME,
  STAFF,
  STAFF_LIST,
} from "../fixtures/tns-roster";

function readFlag(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

type HhsPersona = "admin" | "dsp" | "manager";

function hhsPersona(): HhsPersona | null {
  const p = readFlag("hive.e2e.persona");
  if (p === "dsp" || p === "manager" || p === "admin") return p;
  return null;
}

function tnsOrg() {
  return {
    id: TNS_ORG_ID,
    name: TNS_ORG_NAME,
    is_demo: false,
    legal_name: "True North Supports LLC",
    dba_name: "True North Supports",
    display_acronym: "TNS",
    feature_config: {},
  };
}

function tnsStaff() {
  const p = hhsPersona();
  if (p === "dsp") return STAFF.jake;
  if (p === "manager") return STAFF.harvey;
  return STAFF.admin;
}

function tnsSession() {
  const staff = tnsStaff();
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: staff.id,
    aud: "authenticated",
    role: "authenticated",
    email: staff.email,
    user_metadata: { full_name: staff.name },
    app_metadata: { provider: "email", providers: ["email"] },
    created_at: "2026-01-01T00:00:00.000Z",
  };
  return {
    access_token: "e2e-hhs-access-token",
    refresh_token: "e2e-hhs-refresh-token",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user,
  };
}

function activeSession() {
  return hhsPersona() ? tnsSession() : FAKE_SESSION;
}

function tnsClientRows(): Record<string, unknown>[] {
  return CLIENT_LIST.map((c) => ({
    id: c.id,
    organization_id: TNS_ORG_ID,
    first_name: c.first_name,
    last_name: c.last_name,
    phone_number: null,
    physical_address: null,
    job_code: [...c.codes],
    authorized_dspd_codes: [...c.codes],
    medicaid_id: c.medicaid_id,
    account_status: "active",
    geofence_radius_feet: 500,
    special_directions: null,
    date_of_birth: null,
    feature_config: { emar: false },
    profile_photo_url: null,
    allergies: [],
    dysphagia: false,
    swallowing_alerts: [],
    home_latitude: null,
    home_longitude: null,
    pcsp_goals: [...c.pcsp_goals],
    intake_status: "complete",
    team_id: c.team_id,
    must_change_password: false,
  }));
}

function tnsMemberRows(): Record<string, unknown>[] {
  const org = tnsOrg();
  return STAFF_LIST.map((s) => ({
    id: `mem-${s.id.slice(-8)}`,
    role: s.role,
    job_title: s.jobTitle,
    active: true,
    user_id: s.id,
    organization_id: TNS_ORG_ID,
    created_at: "2025-01-15T00:00:00.000Z",
    organizations: org,
  }));
}

function tnsProfileRows(): Record<string, unknown>[] {
  return STAFF_LIST.map((s) => {
    const [first, ...rest] = s.name.split(" ");
    return {
      id: s.id,
      full_name: s.name,
      first_name: first,
      last_name: rest.join(" ") || first,
      email: s.email,
      must_change_password: false,
      staff_type_keys: s.jobTitle === "DSP" ? ["dsp"] : s.jobTitle === "House Manager" ? ["house_manager"] : [],
      is_active: true,
      hire_date: "2025-01-15",
      start_date: "2025-01-15",
    };
  });
}

function assignmentRows(): Record<string, unknown>[] {
  if (readFlag("hive.e2e.noAssignments") === "1") return [];
  const rows: Record<string, unknown>[] = [];
  const hhsIds = CLIENT_LIST.filter((c) => c.codes.includes("HHS")).map((c) => c.id);
  const assignees = [STAFF.admin.id, STAFF.harvey.id, STAFF.jake.id];
  for (const staffId of assignees) {
    for (const clientId of hhsIds) {
      rows.push({
        id: `sa-${staffId.slice(-4)}-${clientId.slice(-4)}`,
        organization_id: TNS_ORG_ID,
        staff_id: staffId,
        client_id: clientId,
        service_codes: ["HHS"],
      });
    }
  }
  return rows;
}

function tnsRolePermissionRows(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const role of PROVIDER_ROLES) {
    const granted = new Set<Permission>(DEFAULT_MATRIX[role as ProviderRole] ?? []);
    for (const permission of ALL_PERMISSIONS) {
      rows.push({
        organization_id: TNS_ORG_ID,
        role,
        permission,
        enabled: granted.has(permission),
      });
    }
  }
  return rows;
}

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
  const hhs = !!hhsPersona();
  switch (table) {
    case "evv_timesheets":
      return ALL_TIMESHEETS as unknown as Record<string, unknown>[];
    case "teams":
      return TEAMS as unknown as Record<string, unknown>[];
    case "organization_members":
      return hhs
        ? tnsMemberRows()
        : [MEMBERSHIP as unknown as Record<string, unknown>];
    case "organizations":
      return hhs
        ? [tnsOrg()]
        : [ORGANIZATION as unknown as Record<string, unknown>];
    case "org_member_directory":
      return hhs
        ? STAFF_LIST.map((s) => ({ id: s.id, full_name: s.name, email: s.email }))
        : (DIRECTORY as unknown as Record<string, unknown>[]);
    case "profiles":
      return hhs ? tnsProfileRows() : [PROFILE as unknown as Record<string, unknown>];
    case "role_permissions":
      if (hhs) return tnsRolePermissionRows();
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
      return hhs ? tnsClientRows() : (CLIENTS as unknown as Record<string, unknown>[]);
    case "staff_assignments":
      return hhs ? assignmentRows() : [];
    case "hhs_monthly_attendance":
    case "hhs_daily_records_v":
    case "nectar_documents":
    case "policy_signatures":
    case "auditor_accounts":
    case "hive_executives":
    case "org_subscriptions":
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
    if (this.table === "clients" && readFlag("hive.e2e.clientsError") === "1") {
      return {
        data: null,
        error: { message: "Mocked clients read failure", code: "PGRST000" },
        count: null,
      };
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
    getSession: async () => ({ data: { session: activeSession() }, error: null }),
    getUser: async () => ({ data: { user: activeSession().user }, error: null }),
    onAuthStateChange: (cb: (event: string, session: ReturnType<typeof activeSession> | null) => void) => {
      listeners.add(cb as (event: string, session: typeof FAKE_SESSION | null) => void);
      cb("SIGNED_IN", activeSession());
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(cb as (event: string, session: typeof FAKE_SESSION | null) => void);
            },
          },
        },
      };
    },
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => {
      const session = activeSession();
      return { data: { session, user: session.user }, error: null };
    },
  },
  from: (table: string) => new QueryBuilder(table),
  rpc: async (name: string, args?: Record<string, unknown>) => {
    if (name === "clients_for_staff") {
      if (readFlag("hive.e2e.noAssignments") === "1") return { data: [], error: null };
      const staffId = String(args?._staff ?? activeSession().user.id);
      const assigned = new Set(
        assignmentRows()
          .filter((r) => String(r.staff_id) === staffId)
          .map((r) => String(r.client_id)),
      );
      return { data: tnsClientRows().filter((c) => assigned.has(String(c.id))), error: null };
    }
    return { data: null, error: null };
  },
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
