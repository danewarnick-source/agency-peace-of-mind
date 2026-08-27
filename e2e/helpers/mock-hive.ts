/**
 * Playwright network + session mocks so CLIENTS / STAFF e2e can run
 * without live Supabase, live auth, or live PHI.
 *
 * Intercepts:
 *   - supabase.co REST / Auth / Storage / Realtime
 *   - TanStack Start server-fn POSTs (so invite submit never hits live)
 */
import { expect, type Page, type Route } from "@playwright/test";
import { toCrossJSONAsync } from "seroval";
import {
  ALL_PERMISSIONS,
  DEFAULT_MATRIX,
  PROVIDER_ROLES,
  type Permission,
  type ProviderRole,
} from "../../src/lib/rbac";
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_USER_ID,
  CLIENT_LIST,
  CLIENTS,
  DAILY_LOGS,
  DSP_USER_ID,
  ORG_ID,
  ORG_NAME,
  PENDING_INVITE,
  STAFF,
  STAFF_LIST,
  TEAMS,
} from "../fixtures/tns-roster";

export type MockPersona = "admin" | "dsp";

export type MockOptions = {
  persona?: MockPersona;
  emptyClients?: boolean;
  clientsError?: boolean;
  emptyStaff?: boolean;
  emptyLogs?: boolean;
  logsError?: boolean;
};

type Row = Record<string, unknown>;

function b64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fakeJwt(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    aud: "authenticated",
    exp: now + 60 * 60,
    iat: now,
    iss: "https://example.supabase.co/auth/v1",
    sub: userId,
    email,
    role: "authenticated",
    session_id: "00000000-0000-4000-a000-000000000501",
  });
  return `${header}.${payload}.mocksig`;
}

function sessionBlob(userId: string, email: string, name: string) {
  const access_token = fakeJwt(userId, email);
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "mock-refresh-token",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      phone: "",
      confirmed_at: "2026-01-01T00:00:00.000Z",
      last_sign_in_at: "2026-08-27T00:00:00.000Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: name },
      identities: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-08-27T00:00:00.000Z",
    },
  };
}

function orgRow() {
  return {
    id: ORG_ID,
    name: ORG_NAME,
    is_demo: false,
    legal_name: "True North Supports LLC",
    dba_name: "True North Supports",
    display_acronym: "TNS",
    feature_config: {},
  };
}

function profileRow(staff: (typeof STAFF_LIST)[number]): Row {
  const [first, ...rest] = staff.name.split(" ");
  return {
    id: staff.id,
    full_name: staff.name,
    first_name: first,
    last_name: rest.join(" ") || first,
    email: staff.email,
    username: staff.email.split("@")[0],
    must_change_password: false,
    department: null,
    hire_date: "2025-01-15",
    start_date: "2025-01-15",
    end_date: null,
    employee_id: null,
    position: staff.jobTitle,
    positions: [staff.jobTitle],
    account_status: "active",
    worker_type: "w2",
    photo_path: null,
    photo_updated_at: null,
    team_id: "teamId" in staff ? staff.teamId : null,
    phone: null,
    emergency_contact_name: null,
    emergency_contact_relationship: null,
    emergency_contact_phone: null,
    staff_type_keys: staff.jobTitle === "DSP" ? ["dsp"] : staff.jobTitle === "House Manager" ? ["house_manager"] : [],
    ce_suggested_topics: [],
    requires_deescalation: true,
    requires_abi: true,
    is_active: true,
    bc_role: null,
  };
}

function memberRow(staff: (typeof STAFF_LIST)[number], embedOrg: boolean): Row {
  const row: Row = {
    id: `mem-${staff.id.slice(-8)}`,
    role: staff.role,
    job_title: staff.jobTitle,
    active: true,
    user_id: staff.id,
    organization_id: ORG_ID,
    created_at: "2025-01-15T00:00:00.000Z",
  };
  if (embedOrg) row.organizations = orgRow();
  return row;
}

function clientRow(c: (typeof CLIENT_LIST)[number]): Row {
  return {
    id: c.id,
    organization_id: ORG_ID,
    first_name: c.first_name,
    last_name: c.last_name,
    phone_number: null,
    physical_address: null,
    pcsp_goals: [...c.pcsp_goals],
    job_code: [...c.codes],
    home_latitude: null,
    home_longitude: null,
    authorized_dspd_codes: [...c.codes],
    medicaid_id: c.medicaid_id,
    account_status: "active",
    geofence_radius_feet: 500,
    special_directions: null,
    date_of_birth: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_instructions: null,
    emergency_contact_2_name: null,
    emergency_contact_2_phone: null,
    emergency_contact_2_instructions: null,
    is_own_guardian: true,
    guardian_name: null,
    guardian_phone: null,
    guardian_relationship: null,
    guardian_email: null,
    feature_config: {},
    profile_photo_url: null,
    intake_status: "complete",
    team_id: c.team_id,
    level_of_need: null,
    form_1056_number: null,
    form_1056_approved_date: null,
    grievance_acknowledged: false,
    grievance_signed_date: null,
    rights_restrictions: null,
    dnr_status: null,
    dnr_location: null,
    polst_status: null,
    palliative_care_status: null,
    hospice_status: null,
    admin_hours_per_week: null,
    support_coordinator_name: null,
    support_coordinator_email: null,
    support_coordinator_phone: null,
    disability_category: null,
    bsp_status: null,
    diagnoses: null,
    advanced_directives: null,
    admission_date: "2025-07-01",
    discharge_date: null,
  };
}

function billingCodeRows(): Row[] {
  const out: Row[] = [];
  for (const c of CLIENT_LIST) {
    for (const code of c.codes) {
      out.push({
        id: `bc-${c.id.slice(-4)}-${code}`,
        organization_id: ORG_ID,
        client_id: c.id,
        service_code: code,
        unit_type: ["HHS", "RHS", "SLH"].includes(code) ? "daily" : "15min",
        rate_per_unit: 12.5,
        annual_unit_authorization: 1000,
        monthly_max_units: null,
        weekly_cap_units: null,
        service_start_date: "2026-07-01",
        service_end_date: "2027-06-30",
        sce: null,
        provider_approver_email: null,
      });
    }
  }
  return out;
}

function rolePermissionRows(): Row[] {
  const rows: Row[] = [];
  for (const role of PROVIDER_ROLES) {
    const granted = new Set<Permission>(DEFAULT_MATRIX[role as ProviderRole] ?? []);
    for (const permission of ALL_PERMISSIONS) {
      rows.push({
        organization_id: ORG_ID,
        role,
        permission,
        enabled: granted.has(permission),
      });
    }
  }
  return rows;
}

function expandDailyLog(row: (typeof DAILY_LOGS)[number]): Row {
  const staff = STAFF_LIST.find((s) => s.id === row.user_id);
  const client = CLIENT_LIST.find((c) => c.id === row.client_id);
  return {
    ...row,
    profiles: staff
      ? { full_name: staff.name, email: staff.email, agency_name: ORG_NAME }
      : null,
    clients: client
      ? {
          first_name: client.first_name,
          last_name: client.last_name,
          medicaid_id: client.medicaid_id,
        }
      : null,
  };
}

function parseFilters(url: URL): Array<{ col: string; op: string; val: string }> {
  const out: Array<{ col: string; op: string; val: string }> = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset" || key === "apikey") continue;
    const eq = raw.indexOf(".");
    if (eq === -1) continue;
    out.push({ col: key, op: raw.slice(0, eq), val: raw.slice(eq + 1) });
  }
  return out;
}

function matchFilter(row: Row, col: string, op: string, val: string): boolean {
  const v = row[col];
  if (op === "eq") return String(v ?? "") === val;
  if (op === "neq") return String(v ?? "") !== val;
  if (op === "is") {
    if (val === "null") return v === null || v === undefined;
    if (val === "true") return v === true;
    if (val === "false") return v === false;
  }
  if (op === "in") {
    const inner = val.replace(/^\(/, "").replace(/\)$/, "");
    const parts = inner.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
    return parts.includes(String(v ?? ""));
  }
  if (op === "gte") return String(v ?? "") >= val;
  if (op === "lte") return String(v ?? "") <= val;
  return true;
}

function applyFilters(rows: Row[], url: URL): Row[] {
  const filters = parseFilters(url);
  return rows.filter((row) => filters.every((f) => matchFilter(row, f.col, f.op, f.val)));
}

function tableRows(table: string, opts: MockOptions, personaId: string): Row[] {
  const clients = opts.emptyClients ? [] : CLIENT_LIST.map(clientRow);
  const staff = opts.emptyStaff ? STAFF_LIST.filter((s) => s.id === personaId) : STAFF_LIST;

  switch (table) {
    case "organization_members":
      return staff.map((s) => memberRow(s, true));
    case "profiles":
      return staff.map(profileRow);
    case "org_member_directory":
      return staff.map((s) => ({
        id: s.id,
        full_name: s.name,
        email: s.email,
      }));
    case "organizations":
      return [orgRow()];
    case "clients":
      return clients;
    case "client_billing_codes":
      return opts.emptyClients ? [] : billingCodeRows();
    case "client_external_services":
    case "client_medications":
    case "client_documents":
    case "incident_reports":
    case "hrc_restriction_records":
    case "nectar_documents":
    case "policy_signatures":
    case "evv_timesheets":
    case "staff_assignments":
    case "training_tracks":
    case "courses":
    case "course_assignments":
    case "user_permission_overrides":
    case "import_subjects":
    case "auditor_accounts":
    case "staff_types":
    case "hr_documents":
    case "home_staff_designations":
    case "client_staffing_ratios":
      return [];
    case "daily_logs":
      return opts.emptyLogs ? [] : DAILY_LOGS.map((row) => expandDailyLog(row));
    case "role_permissions":
      return rolePermissionRows();
    case "invitations":
      return [{ ...PENDING_INVITE }];
    case "teams":
      return TEAMS.map((t) => ({ ...t }));
    case "home_designations":
      return [
        { id: "des-dsp", organization_id: ORG_ID, label: "DSP", sort: 1, active: true },
        { id: "des-hm", organization_id: ORG_ID, label: "House Manager", sort: 2, active: true },
      ];
    case "hive_executives":
      return [{ user_id: STAFF.dane.id, active: true, id: "hex-dane" }];
    case "org_subscriptions":
      return [{ organization_id: ORG_ID, locked_at: null, created_at: "2026-01-01T00:00:00.000Z" }];
    case "feature_registry":
      return [
        { id: "fr1", feature_key: "client_intake", label: "Clients", description: null, parent_key: null, category: "tab", default_enabled: true, sort_order: 1, required_tier: null, upgrade_blurb: null },
        { id: "fr2", feature_key: "staff_onboarding", label: "Employees", description: null, parent_key: null, category: "tab", default_enabled: true, sort_order: 2, required_tier: null, upgrade_blurb: null },
        { id: "fr3", feature_key: "evv_timesheets", label: "Scheduler", description: null, parent_key: null, category: "tab", default_enabled: true, sort_order: 3, required_tier: null, upgrade_blurb: null },
        { id: "fr4", feature_key: "nectar", label: "NECTAR", description: null, parent_key: null, category: "tab", default_enabled: true, sort_order: 4, required_tier: null, upgrade_blurb: null },
      ];
    case "organization_features":
      return [];
    default:
      return [];
  }
}

function wantsSingle(headers: { [k: string]: string }): boolean {
  const accept = headers.accept || headers.Accept || "";
  const prefer = headers.prefer || headers.Prefer || "";
  return accept.includes("vnd.pgrst.object") || prefer.includes("params=single-object");
}

async function fulfillJson(route: Route, status: number, body: unknown, extra: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "Content-Range, content-range",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

async function handleSupabase(route: Route, opts: MockOptions, personaId: string, session: ReturnType<typeof sessionBlob>) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  const headers = req.headers();

  if (method === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
      },
    });
    return;
  }

  if (url.pathname.startsWith("/auth/v1/user")) {
    await fulfillJson(route, 200, session.user);
    return;
  }
  if (url.pathname.startsWith("/auth/v1/token") || url.pathname.startsWith("/auth/v1/session")) {
    await fulfillJson(route, 200, session);
    return;
  }
  if (url.pathname.startsWith("/auth/v1/")) {
    await fulfillJson(route, 200, {});
    return;
  }
  if (url.pathname.startsWith("/realtime/") || url.pathname.includes("/websocket")) {
    await route.abort();
    return;
  }
  if (url.pathname.startsWith("/storage/") || url.pathname.startsWith("/functions/")) {
    await fulfillJson(route, 404, { error: "not_mocked" });
    return;
  }

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = url.pathname.replace("/rest/v1/rpc/", "").split("/")[0];
    if (rpc === "clients_for_staff") {
      const clients = opts.emptyClients ? [] : CLIENT_LIST.map(clientRow);
      await fulfillJson(route, 200, clients);
      return;
    }
    await fulfillJson(route, 200, []);
    return;
  }

  if (!url.pathname.startsWith("/rest/v1/")) {
    await fulfillJson(route, 200, []);
    return;
  }

  const table = url.pathname.replace("/rest/v1/", "").split("/")[0];

  if (table === "clients" && opts.clientsError && method === "GET") {
    await fulfillJson(route, 400, {
      message: "Mocked clients read failure",
      code: "PGRST000",
      details: null,
      hint: null,
    });
    return;
  }

  if (table === "daily_logs" && opts.logsError && (method === "GET" || method === "HEAD")) {
    await fulfillJson(route, 400, {
      message: "Mocked daily_logs read failure",
      code: "PGRST000",
      details: null,
      hint: null,
    });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    // Never write live data — swallow mutating REST as a successful no-op.
    await fulfillJson(route, 201, []);
    return;
  }

  const rows = applyFilters(tableRows(table, opts, personaId), url);
  const isHead = method === "HEAD";
  const prefer = headers.prefer || headers.Prefer || "";
  const count = prefer.includes("count=");

  if (wantsSingle(headers)) {
    if (rows.length === 0) {
      await fulfillJson(
        route,
        406,
        { code: "PGRST116", details: "Results contain 0 rows", hint: null, message: "Cannot coerce the result to a single JSON object" },
        count ? { "content-range": "*/0" } : {},
      );
      return;
    }
    await fulfillJson(route, 200, rows[0], count ? { "content-range": `0-0/${rows.length}` } : {});
    return;
  }

  const extra = count ? { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : `*/0` } : {};
  if (isHead) {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "Content-Range, content-range",
        ...extra,
      },
      body: "",
    });
    return;
  }
  await fulfillJson(route, 200, rows, extra);
}

function emptyClientCareData(clientId: string) {
  const c = CLIENT_LIST.find((row) => row.id === clientId) ?? CLIENT_LIST[0];
  const identity = {
    id: c.id,
    organization_id: ORG_ID,
    first_name: c.first_name,
    last_name: c.last_name,
    preferred_name: null,
    date_of_birth: null,
    admission_date: "2025-07-01",
    discharge_date: null,
    medicaid_id: c.medicaid_id,
    status: "active",
    phone_number: null,
    is_own_guardian: true,
    guardian_name: null,
    guardian_phone: null,
    support_coordinator_name: null,
    support_coordinator_phone: null,
    support_coordinator_email: null,
    has_abi: null,
    hr_applicable: null,
    dnr_applicable: null,
    diagnoses: [] as string[],
    primary_care_name: null,
    pcsp_expiration_date: null,
    special_directions: null,
  };
  const sections = {
    identity: true,
    care_plan: true,
    billing: true,
    files: true,
    operations: true,
    compliance: true,
  };
  return {
    identity,
    flags: { self_admin_med_support: false, self_admin_med_support_locked: false },
    pcsp_training_id: null,
    goals: [],
    medications: [],
    authorized_codes: [],
    custom_fields: [],
    target_behaviors: [],
    emergency_contacts: [],
    preferred_activities: [],
    visibilityRow: { sections: {}, fields: {} },
    visibility: {
      goalsForStaff: [],
      medicationsVisible: false,
      shiftServiceCode: null,
      sections,
      staffCare: {
        identity,
        goals: [],
        medications: [],
        authorized_codes: [],
        custom_fields: [],
        target_behaviors: [],
        emergency_contacts: [],
        preferred_activities: [],
      },
    },
  };
}

function decodeServerFnExport(url: string): string {
  try {
    const id = decodeURIComponent(url.split("/_serverFn/")[1]?.split("?")[0] ?? "");
    const parsed = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as { export?: string };
    return parsed.export ?? "";
  } catch {
    return "";
  }
}

function serverFnPayload(url: string, body: string): unknown {
  const fn = decodeServerFnExport(url);
  if (/createInvitation/i.test(fn)) {
    let email = "invited@example.test";
    const m = `${url}\n${body}`.match(/sep1\.tester@example\.test|[a-z0-9._%+-]+@example\.test/i);
    if (m) email = m[0];
    return {
      invitation: {
        ...PENDING_INVITE,
        id: "00000000-0000-4000-a000-000000000402",
        email,
        token: "mock-invite-created",
      },
      email_sent: true,
      email_error: null,
    };
  }
  if (/checkHiveExecutive/i.test(fn)) return { isExecutive: false };
  if (/getMyEntitlements/i.test(fn)) {
    return {
      organization_id: ORG_ID,
      tier: "pro",
      status: "active",
      addons: ["hive_training", "nectar_infusion"],
    };
  }
  if (/getMyOrgFeatures/i.test(fn)) {
    return {
      organization_id: ORG_ID,
      registry: tableRows("feature_registry", {}, ADMIN_USER_ID),
      overrides: [],
      effective: {
        client_intake: true,
        staff_onboarding: true,
        evv_timesheets: true,
        nectar: true,
        pcsp: true,
        pba_ledgers: true,
        hive_training: true,
        state_audit: false,
      },
    };
  }
  if (/getInboxUnreadCount|getPendingUpgradeRequestCount/i.test(fn)) return { count: 0 };
  if (/getActiveDraftJobs/i.test(fn)) return { jobs: [] };
  if (/listPendingClientSubjects/i.test(fn)) return { items: [], jobs: {} };
  if (/getHrComplianceMatrix/i.test(fn)) return { requirements: [], staff: [] };
  if (/getStaffPii|getStaffTrainingRiskFlags/i.test(fn)) return null;
  if (/recordPhiAccess|dismissUiPref|requestPermission/i.test(fn)) return { ok: true };
  if (/evaluateShiftNote/i.test(fn)) {
    return { status: "Verified", feedback: "Mocked NECTAR coach — not a live review." };
  }
  if (/scanNoteForTriggers/i.test(fn)) {
    return {
      hasIncidentTrigger: false,
      hasMedicalTrigger: false,
      hasEmarTrigger: false,
      triggerTypes: [],
      triggerSummary: "",
    };
  }
  if (/draftShiftNote/i.test(fn)) {
    return "Mocked NECTAR draft — not used in this suite.";
  }
  if (/listClientTargetBehaviors/i.test(fn)) {
    return { ok: true };
  }
  if (/getClientCareData/i.test(fn)) {
    const idMatch = `${url}\n${body}`.match(/00000000-0000-4000-a000-00000000010[1-4]/);
    return emptyClientCareData(idMatch?.[0] ?? CLIENT_LIST[0].id);
  }
  if (/getClientSpecificTraining|getSupportStrategies|createPersonCentered/i.test(fn)) {
    return { training: null };
  }
  if (/getClientIntakeChecklist|getUiDismissals/i.test(fn)) return [];
  // Arrays: obligations, instances, lists. Safer default than an object
  // so dashboard `.map()` / `for...of` calls don't crash the shell.
  if (
    /listCompanyObligations|listMyObligation|listDeadline|listRate|listClient|listUpi|listRhs/i.test(
      fn,
    )
  ) {
    return [];
  }
  if (/DraftJobs/i.test(fn)) return { jobs: [] };
  if (/Count/i.test(fn)) return { count: 0 };
  if (/list|Checklist|Dismissals|search/i.test(fn)) return [];
  if (/create|update|delete|set|record|dismiss|request|revoke|resend/i.test(fn)) {
    return { ok: true };
  }
  return [];
}

async function handleServerFn(route: Route) {
  const req = route.request();
  if (req.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
      },
    });
    return;
  }
  const body = req.postData() ?? req.url();
  const payload = serverFnPayload(req.url(), body);
  const serialized = await toCrossJSONAsync({ result: payload });
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-tss-serialized": "true",
    },
    body: JSON.stringify(serialized),
  });
}

function isServerFnUrl(url: URL): boolean {
  const p = url.pathname;
  return (
    p.includes("_serverFn") ||
    p.includes("/_server") ||
    p.startsWith("/_tanstack") ||
    p.includes("server-fn")
  );
}

export async function installHiveMocks(page: Page, opts: MockOptions = {}): Promise<void> {
  const persona = opts.persona ?? "admin";
  const personaId = persona === "dsp" ? DSP_USER_ID : ADMIN_USER_ID;
  const personaStaff = persona === "dsp" ? STAFF.jake : STAFF.admin;
  const session = sessionBlob(personaId, personaStaff.email, personaStaff.name);

  await page.route(/https?:\/\/[^/]*supabase\.co\/.*/, (route) => handleSupabase(route, opts, personaId, session));

  await page.route((url) => isServerFnUrl(url), (route) => handleServerFn(route));

  // Catch same-origin POSTs that look like Start server functions even if
  // the path scheme changes between TanStack Start versions.
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):\d+\/.*/, async (route) => {
    const req = route.request();
    const headers = req.headers();
    if (headers["x-tsr-serverfn"] === "true" || headers["x-tsr-serverFn"] === "true") {
      await handleServerFn(route);
      return;
    }
    const url = new URL(req.url());
    if (isServerFnUrl(url)) {
      await handleServerFn(route);
      return;
    }
    await route.continue();
  });

  await page.addInitScript(
    ({ storageKey, sessionJson, orgId, persona }) => {
      try {
        window.localStorage.setItem(storageKey, sessionJson);
        window.localStorage.setItem("hive.activeOrgId", orgId);
        window.localStorage.setItem("portal-view", persona === "dsp" ? "staff" : "admin");
      } catch {
        /* ignore */
      }
    },
    {
      storageKey: "sb-mmknqtdrefbzwfdtykza-auth-token",
      sessionJson: JSON.stringify(session),
      orgId: ORG_ID,
      persona,
    },
  );
}

export async function assertPageNotBlank(page: Page, label: string): Promise<void> {
  const body = page.locator("body");
  await expect(body, `${label} rendered no body`).toBeVisible();
  const text = ((await body.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  expect(text.length, `${label} was blank`).toBeGreaterThan(12);
  await expect(
    page.getByText(/Something went wrong in the dashboard shell/i),
    `${label} crashed the dashboard shell`,
  ).toHaveCount(0);
}

export async function waitForDashboard(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  const loading = page.getByText(/^Loading…$/);
  await loading.waitFor({ state: "hidden", timeout: 25_000 }).catch(() => undefined);
}

export { ADMIN_EMAIL, ADMIN_NAME, ADMIN_USER_ID, CLIENTS, DAILY_LOGS, STAFF };
