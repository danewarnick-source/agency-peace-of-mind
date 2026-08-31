/**
 * Browser-side Supabase + TanStack server-fn mock for admin scheduler e2e.
 *
 * Intercepts every call to the live project so these tests never read or
 * write production calendar rows. Auth is a seeded localStorage session;
 * REST and /_serverFn responses are fixtures shaped like True North's
 * Sep 1 go-live week (Tommy/Jake SEI, Blake/Harvey HHS, Stephen/Tom SLH).
 */
import fs from "node:fs";
import path from "node:path";
import type { Page, Request } from "@playwright/test";
import { ALL_PERMISSIONS, DEFAULT_MATRIX } from "../../src/lib/rbac";

export const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
export const ADMIN_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
export const STAFF = {
  tommy: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
  blake: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3",
  stephen: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4",
  riley: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5",
} as const;
export const CLIENT = {
  jake: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
  harvey: "cccccccc-cccc-cccc-cccc-ccccccccccc2",
  tom: "cccccccc-cccc-cccc-cccc-ccccccccccc3",
} as const;
export const SHIFT = {
  seiPublished: "dddddddd-dddd-dddd-dddd-ddddddddddd1",
  seiDraftOpen: "dddddddd-dddd-dddd-dddd-ddddddddddd2",
  hhsPublished: "dddddddd-dddd-dddd-dddd-ddddddddddd3",
  slhPublished: "dddddddd-dddd-dddd-dddd-ddddddddddd4",
  seiEvening: "dddddddd-dddd-dddd-dddd-ddddddddddd5",
  slhDraftAssigned: "dddddddd-dddd-dddd-dddd-ddddddddddd6",
} as const;

const PROJECT_REF = "mmknqtdrefbzwfdtykza";
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

/** Sep 1 2026 is MDT (UTC-6). */
function mt(date: string, time: string): string {
  return new Date(`${date}T${time}:00-06:00`).toISOString();
}

export type HiveRole = "admin" | "employee";

export type WriteAttempt = {
  method: string;
  url: string;
  table?: string;
};

export type HiveMock = {
  writes: WriteAttempt[];
};

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.e2e`;
}

function userFor(role: HiveRole) {
  const id = role === "admin" ? ADMIN_ID : STAFF.riley;
  const email = role === "admin" ? "tns-admin-e2e@example.com" : "riley-staff-e2e@example.com";
  const now = new Date().toISOString();
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function sessionFor(role: HiveRole) {
  const user = userFor(role);
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const access_token = fakeJwt({
    aud: "authenticated",
    sub: user.id,
    email: user.email,
    role: "authenticated",
    exp,
    iat: exp - 60 * 60,
  });
  return {
    access_token,
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 60 * 60 * 12,
    expires_at: exp,
    user,
  };
}

const ORG = {
  name: "True North Supports",
  is_demo: false,
  legal_name: "True North Supports LLC",
  dba_name: "True North Supports",
  display_acronym: "TNS",
};

function members() {
  const ids = [ADMIN_ID, STAFF.tommy, STAFF.blake, STAFF.stephen, STAFF.riley];
  return ids.map((user_id, i) => ({
    id: `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee${i + 1}`,
    user_id,
    organization_id: ORG_ID,
    role:
      user_id === ADMIN_ID
        ? "admin"
        : "employee",
    job_title: user_id === ADMIN_ID ? "Owner" : "DSP",
    active: true,
    organizations: ORG,
  }));
}

function profiles() {
  return [
    { id: ADMIN_ID, first_name: "Dana", last_name: "Admin", full_name: "Dana Admin", is_active: true, start_date: "2024-01-01", must_change_password: false, staff_type_keys: ["admin"], bc_role: null },
    { id: STAFF.tommy, first_name: "Tommy", last_name: "Jones", full_name: "Tommy Jones", is_active: true, start_date: "2024-01-01", must_change_password: false, staff_type_keys: ["dsp"], bc_role: null },
    { id: STAFF.blake, first_name: "Blake", last_name: "Stevens", full_name: "Blake Stevens", is_active: true, start_date: "2024-01-01", must_change_password: false, staff_type_keys: ["dsp"], bc_role: null },
    { id: STAFF.stephen, first_name: "Stephen", last_name: "Prince", full_name: "Stephen Prince", is_active: true, start_date: "2024-01-01", must_change_password: false, staff_type_keys: ["dsp"], bc_role: null },
    { id: STAFF.riley, first_name: "Riley", last_name: "NoShifts", full_name: "Riley NoShifts", is_active: true, start_date: "2025-06-01", must_change_password: false, staff_type_keys: ["dsp"], bc_role: null },
  ];
}

function clients() {
  return [
    { id: CLIENT.jake, first_name: "Jake", last_name: "Probert", team_id: null, admin_hours_per_week: null, has_abi: false, organization_id: ORG_ID },
    { id: CLIENT.harvey, first_name: "Harvey", last_name: "Alisa", team_id: null, admin_hours_per_week: 4, has_abi: false, organization_id: ORG_ID },
    { id: CLIENT.tom, first_name: "Tom", last_name: "Jones", team_id: null, admin_hours_per_week: null, has_abi: false, organization_id: ORG_ID },
  ];
}

function shifts() {
  return [
    {
      id: SHIFT.seiPublished,
      staff_id: STAFF.tommy,
      client_id: CLIENT.jake,
      job_code: "SEI",
      service_code: "SEI",
      starts_at: mt("2026-09-01", "09:00"),
      ends_at: mt("2026-09-01", "15:00"),
      status: "published",
      published: true,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
    {
      id: SHIFT.seiDraftOpen,
      staff_id: null,
      client_id: CLIENT.jake,
      job_code: "SEI",
      service_code: "SEI",
      starts_at: mt("2026-09-01", "15:30"),
      ends_at: mt("2026-09-01", "16:30"),
      status: "draft",
      published: false,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
    {
      id: SHIFT.hhsPublished,
      staff_id: STAFF.blake,
      client_id: CLIENT.harvey,
      job_code: "HHS",
      service_code: "HHS",
      starts_at: mt("2026-09-01", "08:00"),
      ends_at: mt("2026-09-01", "16:00"),
      status: "published",
      published: true,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
    {
      id: SHIFT.slhPublished,
      staff_id: STAFF.stephen,
      client_id: CLIENT.tom,
      job_code: "SLH",
      service_code: "SLH",
      starts_at: mt("2026-09-01", "10:00"),
      ends_at: mt("2026-09-01", "14:00"),
      status: "published",
      published: true,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
    {
      // 8pm–10pm MT on Sep 1 = 02:00–04:00 UTC Sep 2. Must still render on Sep 1 in Denver.
      id: SHIFT.seiEvening,
      staff_id: STAFF.tommy,
      client_id: CLIENT.jake,
      job_code: "SEI",
      service_code: "SEI",
      starts_at: mt("2026-09-01", "20:00"),
      ends_at: mt("2026-09-01", "22:00"),
      status: "published",
      published: true,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
    {
      // Unpublished assigned SLH — staff schedule / Staff view must still show it.
      id: SHIFT.slhDraftAssigned,
      staff_id: STAFF.stephen,
      client_id: CLIENT.tom,
      job_code: "SLH",
      service_code: "SLH",
      starts_at: mt("2026-09-01", "16:00"),
      ends_at: mt("2026-09-01", "18:00"),
      status: "draft",
      published: false,
      parent_shift_id: null,
      organization_id: ORG_ID,
    },
  ];
}

function auths() {
  return [
    { client_id: CLIENT.jake, service_code: "SEI", annual_unit_authorization: 4000, weekly_cap_units: 40, service_end_date: null, organization_id: ORG_ID },
    { client_id: CLIENT.harvey, service_code: "HHS", annual_unit_authorization: 365, weekly_cap_units: null, service_end_date: null, organization_id: ORG_ID },
    { client_id: CLIENT.tom, service_code: "SLH", annual_unit_authorization: 2000, weekly_cap_units: 40, service_end_date: null, organization_id: ORG_ID },
  ];
}

function assigns() {
  return [
    { staff_id: STAFF.tommy, client_id: CLIENT.jake, organization_id: ORG_ID },
    { staff_id: STAFF.blake, client_id: CLIENT.harvey, organization_id: ORG_ID },
    { staff_id: STAFF.stephen, client_id: CLIENT.tom, organization_id: ORG_ID },
  ];
}

function permissionsFor(role: HiveRole) {
  const granted = role === "admin" ? ALL_PERMISSIONS : DEFAULT_MATRIX.employee;
  const grantedSet = new Set(granted);
  return ALL_PERMISSIONS.map((permission) => ({
    organization_id: ORG_ID,
    role: role === "admin" ? "admin" : "employee",
    permission,
    enabled: grantedSet.has(permission),
  }));
}

function parseEq(search: URLSearchParams, key: string): string | null {
  const raw = search.get(key);
  if (!raw) return null;
  if (raw.startsWith("eq.")) return raw.slice(3);
  return null;
}

function parseIn(search: URLSearchParams, key: string): string[] | null {
  const raw = search.get(key);
  if (!raw) return null;
  const m = raw.match(/^in\.\((.*)\)$/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function wantsSingle(req: Request): boolean {
  const accept = req.headers()["accept"] ?? "";
  return accept.includes("vnd.pgrst.object+json");
}

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
    "access-control-expose-headers": "content-range,content-profile,preference-applied",
    "content-type": "application/json; charset=utf-8",
    ...extra,
  };
}

function filterRows(table: string, rows: Record<string, unknown>[], search: URLSearchParams): Record<string, unknown>[] {
  let out = rows;
  const userId = parseEq(search, "user_id");
  if (userId) out = out.filter((r) => r.user_id === userId);
  const idEq = parseEq(search, "id");
  if (idEq) out = out.filter((r) => r.id === idEq);
  const idIn = parseIn(search, "id");
  if (idIn) out = out.filter((r) => idIn.includes(String(r.id)));
  const orgEq = parseEq(search, "organization_id");
  if (orgEq) out = out.filter((r) => !r.organization_id || r.organization_id === orgEq);
  const clientEq = parseEq(search, "client_id");
  if (clientEq) out = out.filter((r) => r.client_id === clientEq);
  const staffEq = parseEq(search, "staff_id");
  if (staffEq) out = out.filter((r) => r.staff_id === staffEq);
  const activeEq = parseEq(search, "active");
  if (activeEq === "true") out = out.filter((r) => r.active === true);
  void table;
  return out;
}

function tableRows(table: string, role: HiveRole): Record<string, unknown>[] {
  switch (table) {
    case "organization_members":
      return members().map((m) =>
        role === "employee" && m.user_id === STAFF.riley
          ? { ...m, role: "employee" }
          : m,
      );
    case "organizations":
      return [{ id: ORG_ID, ...ORG }];
    case "profiles":
      return profiles();
    case "clients":
      return clients();
    case "teams":
      return [];
    case "scheduled_shifts":
      return shifts();
    case "client_billing_codes":
      return auths();
    case "staff_assignments":
      return assigns();
    case "time_off_requests":
      return [];
    case "shift_swap_requests":
      return [];
    case "role_permissions":
      return permissionsFor(role);
    case "user_permission_overrides":
      return [];
    case "auditor_accounts":
      return [];
    case "org_subscriptions":
      return [];
    case "nectar_documents":
      return [];
    case "policy_signatures":
      return [];
    case "hive_executives":
      return [];
    case "feature_registry":
      return featureRegistry();
    case "organization_features":
      return [];
    default:
      return [];
  }
}

function restTable(pathname: string): string | null {
  const m = pathname.match(/\/rest\/v1\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function serverFnExport(url: string): string {
  try {
    const id = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as { export?: string };
    return parsed.export ?? "";
  } catch {
    return "";
  }
}

const FEATURE_KEYS = [
  "evv_timesheets",
  "client_intake",
  "pcsp",
  "staff_onboarding",
  "nectar",
  "hive_training",
  "state_audit",
  "pba_ledgers",
] as const;

function featureRegistry() {
  return FEATURE_KEYS.map((feature_key, i) => ({
    id: `ffffffff-ffff-ffff-ffff-fffffffffff${i + 1}`,
    feature_key,
    label: feature_key === "evv_timesheets" ? "Timesheets" : feature_key,
    description: null,
    parent_key: null,
    category: "tab" as const,
    default_enabled: true,
    sort_order: i + 1,
    required_tier: null,
    upgrade_blurb: null,
  }));
}

function serverFnResult(exportName: string): unknown {
  if (/checkHiveExecutive/i.test(exportName)) return { isExecutive: false };
  if (/getMyEntitlements/i.test(exportName)) {
    return { organization_id: ORG_ID, addons: [], tier: "growth", status: "active" };
  }
  if (/getMyOrgFeatures/i.test(exportName)) {
    return {
      organization_id: ORG_ID,
      effective: Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])),
      registry: featureRegistry(),
    };
  }
  if (/getActiveDraftJobs/i.test(exportName)) return { jobs: [] };
  if (/getOrgCeRoster/i.test(exportName)) {
    return { organizationId: ORG_ID, goalHours: 12, rows: [], behindCount: 0 };
  }
  if (/ensureCurrentSummaryPeriods/i.test(exportName)) return { ensured: 0 };
  if (/getInboxUnreadCount|getPendingUpgradeRequestCount/i.test(exportName)) {
    return { count: 0 };
  }
  if (/getMissingThirtyDayStaffIds|getMissingAbiStaffIds/i.test(exportName)) {
    return { missingIds: [] };
  }
  if (/nectarDraftShifts|autoFillOpenShifts/i.test(exportName)) {
    return { drafts: [], proposals: [] };
  }
  if (/nudgeDraftJob|processDraftChunk|finalizeRequirementsDraft/i.test(exportName)) {
    return { ok: true };
  }
  // List-shaped server fns (obligations, open summaries, etc.)
  if (/^list|^fetch/i.test(exportName)) return [];
  return {};
}

const WRITE_TABLES = new Set([
  "scheduled_shifts",
  "time_off_requests",
  "shift_swap_requests",
  "staff_assignments",
  "evv_timesheets",
]);

export async function installHiveMocks(page: Page, role: HiveRole = "admin"): Promise<HiveMock> {
  const mock: HiveMock = { writes: [] };
  const session = sessionFor(role);

  await page.route((url) => url.hostname.endsWith("supabase.co"), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method().toUpperCase();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    if (url.pathname.startsWith("/auth/v1/user")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify(session.user),
      });
      return;
    }

    if (url.pathname.startsWith("/auth/v1/token") || url.pathname.startsWith("/auth/v1/logout")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        body: JSON.stringify(session),
      });
      return;
    }

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      await route.fulfill({ status: 200, headers: corsHeaders(), body: "[]" });
      return;
    }

    const table = restTable(url.pathname);
    if (table) {
      if (method !== "GET" && method !== "HEAD") {
        mock.writes.push({ method, url: req.url(), table });
        if (WRITE_TABLES.has(table)) {
          await route.fulfill({
            status: 403,
            headers: corsHeaders(),
            body: JSON.stringify({
              message: "E2E mock: refusing to mutate live calendar/shift tables",
              code: "E2E_READONLY",
            }),
          });
          return;
        }
        await route.fulfill({
          status: 201,
          headers: corsHeaders(),
          body: JSON.stringify([]),
        });
        return;
      }

      const rows = filterRows(table, tableRows(table, role), url.searchParams);
      const single = wantsSingle(req) || (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
      if (single) {
        if (rows.length === 0) {
          await route.fulfill({
            status: 406,
            headers: corsHeaders({ "content-range": "*/0" }),
            body: JSON.stringify({ code: "PGRST116", message: "Cannot coerce the result to a single JSON object" }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          headers: corsHeaders({ "content-range": "0-0/1" }),
          body: JSON.stringify(rows[0]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: corsHeaders({
          "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0",
        }),
        body: JSON.stringify(rows),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: corsHeaders(),
      body: JSON.stringify({}),
    });
  });

  // TanStack Start server functions. Per-fn shapes match production
  // handlers (a generic [] crashed DraftJobsProvider via jobs.map).
  // Calendar mutations are stubbed so Publish / Save never hit production.
  await page.route(/_serverFn/, async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = req.url();
    const name = serverFnExport(url);
    const mutating = /saveShift|deleteShift|publishWeek|createRecurring|applyDrafts|autoFill|setAdminTimeOff/i.test(
      name,
    );
    if (mutating) {
      mock.writes.push({ method, url, table: "_serverFn" });
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result: mutating ? { ok: false, message: "E2E mock: writes blocked" } : serverFnResult(name) }),
    });
  });

  await page.addInitScript(
    ({ storageKey, sessionJson, orgId, portalView }) => {
      window.localStorage.setItem(storageKey, sessionJson);
      window.localStorage.setItem("hive.activeOrgId", orgId);
      window.localStorage.setItem("portal-view", portalView);
    },
    {
      storageKey: AUTH_STORAGE_KEY,
      sessionJson: JSON.stringify(session),
      orgId: ORG_ID,
      portalView: role === "admin" ? "admin" : "staff",
    },
  );

  return mock;
}

export async function saveShot(page: Page, name: string): Promise<string> {
  const dirs = [
    path.join(process.cwd(), "e2e/artifacts"),
    "/opt/cursor/artifacts/screenshots",
  ];
  let last = "";
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      last = file;
    } catch {
      /* optional artifact mount may be missing */
    }
  }
  return last;
}
