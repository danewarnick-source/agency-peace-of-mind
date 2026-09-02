/**
 * Mock-auth helper for Hive Training / Launchpad e2e.
 *
 * Intercepts Supabase Auth + PostgREST so tests never sign in as live staff
 * and never write production completions. A live staging override that flips
 * `has_passed_launchpad` for named testers is NOT used here and is not a
 * product feature.
 */
import type { Page, Request, Route } from "@playwright/test";

export const IDS = {
  org: "11111111-1111-4111-8111-111111111111",
  staff: "22222222-2222-4222-8222-222222222222",
  admin: "33333333-3333-4333-8333-333333333333",
  client: "44444444-4444-4444-8444-444444444444",
  assignment: "55555555-5555-4555-8555-555555555555",
  assignmentLocked: "55555555-5555-4555-8555-555555555556",
  course: "66666666-6666-4666-8666-666666666666",
  topicReady: "77777777-7777-4777-8777-777777777777",
  topicSoon: "88888888-8888-4888-8888-888888888888",
  htModule: "99999999-9999-4999-8999-999999999999",
  trainingModule: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  membership: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  catalogFull: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  catalogAla: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  incompleteStaff: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

const SUPABASE_HOST = "mmknqtdrefbzwfdtykza.supabase.co";
const SESSION_KEY = `sb-mmknqtdrefbzwfdtykza-auth-token`;

export type MockRole = "admin" | "employee";

export type HiveE2EWorld = {
  role: MockRole;
  hasPassedLaunchpad: boolean;
};

export type WriteAttempt = {
  method: string;
  table: string;
  url: string;
};

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fakeJwt(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    aud: "authenticated",
    exp: now + 60 * 60 * 24,
    iat: now,
    iss: `https://${SUPABASE_HOST}/auth/v1`,
    sub: userId,
    email,
    role: "authenticated",
    session_id: "e2e-mock-session",
  });
  return `${header}.${payload}.e2emock`;
}

function userIdFor(world: HiveE2EWorld): string {
  return world.role === "admin" ? IDS.admin : IDS.staff;
}

function emailFor(world: HiveE2EWorld): string {
  return world.role === "admin" ? "e2e.admin@hive.test" : "e2e.staff@hive.test";
}

function nameFor(world: HiveE2EWorld): string {
  return world.role === "admin" ? "E2E Admin" : "E2E Staff";
}

function sessionFor(world: HiveE2EWorld) {
  const id = userIdFor(world);
  const email = emailFor(world);
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt(id, email),
    refresh_token: "e2e-refresh-token",
    expires_in: 86_400,
    expires_at: now + 86_400,
    token_type: "bearer",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: nameFor(world) },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function wantsObject(req: Request): boolean {
  const accept = req.headers()["accept"] ?? "";
  return accept.includes("application/vnd.pgrst.object+json");
}

async function fulfillJson(
  route: Route,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
      ...extraHeaders,
    },
    body: body === undefined || body === null ? "" : JSON.stringify(body),
  });
}

function orgEmbed() {
  return {
    name: "E2E Agency",
    is_demo: false,
    legal_name: "E2E Agency LLC",
    dba_name: "E2E",
    display_acronym: "E2E",
  };
}

function members() {
  return [
    { id: IDS.admin, label: "E2E Admin", has_passed_launchpad: true },
    { id: IDS.staff, label: "E2E Staff", has_passed_launchpad: false },
    { id: IDS.incompleteStaff, label: "E2E Incomplete", has_passed_launchpad: false },
  ];
}

function clientRow() {
  return {
    id: IDS.client,
    first_name: "Jordan",
    last_name: "Lee",
    home_latitude: 40.7608,
    home_longitude: -111.891,
    pcsp_goals: ["Stay safe in the community"],
    job_code: ["SLH", "SLN"],
    authorized_dspd_codes: ["SLH", "SLN"],
    medicaid_id: "000123456789",
    physical_address: "123 Test St, Salt Lake City, UT",
    geofence_radius_feet: 500,
    special_directions: null,
    profile_photo_url: null,
    feature_config: {},
    emergency_contact_name: null,
    emergency_contact_phone: null,
    date_of_birth: "1995-01-15",
    organization_id: IDS.org,
  };
}

function assignmentRow(id: string, status: string, userId: string) {
  return {
    id,
    organization_id: IDS.org,
    user_id: userId,
    course_id: IDS.course,
    status,
    progress_pct: status === "completed" ? 100 : status === "in_progress" ? 40 : 0,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    expires_at: null,
    payment_model: "bulk_seats",
    created_at: new Date().toISOString(),
    course: {
      id: IDS.course,
      title: "DSPD Provider Orientation",
      slug: "dspd-orientation",
      description: "Launchpad core orientation.",
      cert_validity_months: 12,
    },
  };
}

function featureRegistry() {
  return [
    {
      id: "fr-hive-training",
      feature_key: "hive_training",
      label: "HIVE Training",
      description: "DSPD-aligned staff training",
      parent_key: null,
      category: "tab",
      default_enabled: true,
      sort_order: 1,
      required_tier: "pro",
      upgrade_blurb: "Turn on HIVE Training for this organization.",
    },
  ];
}

function decodeServerFnMeta(url: string): { exportName: string; file: string; raw: string } {
  try {
    const pathName = new URL(url).pathname;
    const marker = "/_serverFn/";
    const idx = pathName.indexOf(marker);
    if (idx < 0) return { exportName: "", file: "", raw: "" };
    const fnId = decodeURIComponent(pathName.slice(idx + marker.length).split("/")[0] ?? "");
    const raw = Buffer.from(fnId, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { export?: string; file?: string };
    return { exportName: parsed.export ?? "", file: parsed.file ?? "", raw };
  } catch {
    return { exportName: "", file: "", raw: "" };
  }
}

function serverFnPayload(world: HiveE2EWorld, req: Request): unknown {
  const url = req.url();
  const body = req.postData() ?? "";
  const meta = decodeServerFnMeta(url);
  const hay = `${url} ${body} ${meta.exportName} ${meta.file} ${meta.raw}`.toLowerCase();

  if (hay.includes("createclockin") || /"gps"/.test(body)) {
    if (!world.hasPassedLaunchpad) {
      throw Object.assign(new Error("Launchpad blocked"), {
        status: 400,
        message:
          "Complete Launchpad before clocking in. Open Training to finish.",
      });
    }
    throw Object.assign(new Error("E2E does not punch"), {
      status: 400,
      message: "E2E: clock-in not executed",
    });
  }

  if (hay.includes("getmyorgfeatures") || body.includes("activeOrganizationId")) {
    return {
      organization_id: IDS.org,
      effective: {
        hive_training: true,
        nectar: true,
        evv_timesheets: true,
        pcsp: true,
        client_intake: true,
        staff_onboarding: true,
        state_audit: true,
        pba_ledgers: true,
      },
      registry: featureRegistry(),
    };
  }

  if (hay.includes("getmyentitlements")) {
    return {
      organization_id: IDS.org,
      tier: "pro",
      status: "active",
      addons: ["nectar_infusion", "hive_training"],
    };
  }

  if (hay.includes("checkhiveexecutive")) {
    return { isExecutive: false };
  }

  if (hay.includes("listmypendingpolicies")) {
    return { pending: [] };
  }

  if (hay.includes("getmytrainingenrollments") || hay.includes("gettrainingproducts") || hay.includes("getorgtrainingpurchases")) {
    return [];
  }

  if (hay.includes("listmyobligationinstances") || hay.includes("checkandmarkoverdue")) {
    return [];
  }

  if (hay.includes("getrostertrainingstatus")) {
    return [];
  }

  if (hay.includes("getmyclienttraining")) {
    return { items: [] };
  }

  if (hay.includes("getmyotherassignments")) {
    return { open_count: 0, safety_critical_open_count: 0, total: 0, completed: 0 };
  }

  if (hay.includes("getmycestatus")) {
    return { ceApplies: false };
  }

  if (hay.includes("getinboxunread") || hay.includes("getpendingupgrade")) {
    return { count: 0 };
  }

  if (
    hay.includes("listcompanyobligations") ||
    hay.includes("getincident") ||
    hay.includes("listagencypolicies") ||
    hay.includes("listpolicyjobcodeoptions")
  ) {
    return [];
  }

  if (
    hay.includes("getorgceroster")
  ) {
    return { organizationId: IDS.org, goalHours: 12, rows: [], behindCount: 0 };
  }

  if (hay.includes("getactivedraftjobs")) {
    return { jobs: [] };
  }

  if (
    hay.includes("listdeadline") ||
    hay.includes("listopensummaries") ||
    hay.includes("searchactivestaff")
  ) {
    return [];
  }

  if (hay.includes("ensurecurrentsummary")) {
    return { ensured: 0 };
  }

  if (hay.includes("getpendingtrackingforms")) {
    return [];
  }

  // Default GET-shaped payload: extra fields are ignored by typed readers.
  return {
    isExecutive: false,
    organization_id: IDS.org,
    tier: "pro",
    status: "active",
    addons: ["nectar_infusion", "hive_training"],
    effective: {
      hive_training: true,
      nectar: true,
      evv_timesheets: true,
      pcsp: true,
      client_intake: true,
      staff_onboarding: true,
    },
    registry: featureRegistry(),
    pending: [],
    ceApplies: false,
    open_count: 0,
    safety_critical_open_count: 0,
    total: 0,
    completed: 0,
    count: 0,
    jobs: [],
    rows: [],
    ensured: 0,
    behindCount: 0,
    goalHours: 12,
  };
}

function paramEq(url: string, key: string): string | null {
  const u = new URL(url);
  const v = u.searchParams.get(key);
  if (v?.startsWith("eq.")) return v.slice(3);
  return null;
}

function paramIn(url: string, key: string): string[] | null {
  const u = new URL(url);
  const v = u.searchParams.get(key);
  if (!v) return null;
  const m = v.match(/^in\.\((.*)\)$/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^"+|"+$/g, ""))
    .filter(Boolean);
}

function wrapServerFnResult(payload: unknown): unknown {
  // createServerFn client middleware reads envelope.result.
  // A bare payload makes every useQuery see `undefined` and the dashboard
  // stays on "Loading…".
  return { result: payload };
}

function restRows(world: HiveE2EWorld, table: string, url: string): unknown[] {
  const uid = userIdFor(world);
  const u = new URL(url);

  if (table === "profiles") {
    const all = [
      {
        id: IDS.admin,
        full_name: "E2E Admin",
        email: "e2e.admin@hive.test",
        must_change_password: false,
        staff_type_keys: [],
        bc_role: null,
        has_passed_launchpad: true,
        evv_gps_consent_status: "Accepted",
      },
      {
        id: IDS.staff,
        full_name: "E2E Staff",
        email: "e2e.staff@hive.test",
        must_change_password: false,
        staff_type_keys: [],
        bc_role: null,
        has_passed_launchpad: world.role === "employee" ? world.hasPassedLaunchpad : false,
        evv_gps_consent_status: "Accepted",
      },
      {
        id: IDS.incompleteStaff,
        full_name: "E2E Incomplete",
        email: "e2e.incomplete@hive.test",
        must_change_password: false,
        staff_type_keys: [],
        bc_role: null,
        has_passed_launchpad: false,
        evv_gps_consent_status: "Accepted",
      },
    ];
    const idEq = paramEq(url, "id");
    if (idEq) {
      if (idEq === uid) {
        return [
          {
            id: uid,
            full_name: nameFor(world),
            email: emailFor(world),
            must_change_password: false,
            staff_type_keys: [],
            bc_role: null,
            has_passed_launchpad: world.hasPassedLaunchpad,
            evv_gps_consent_status: "Accepted",
          },
        ];
      }
      return all.filter((p) => p.id === idEq);
    }
    const idIn = paramIn(url, "id");
    if (idIn) return all.filter((p) => idIn.includes(p.id));
    return all;
  }

  if (table === "organization_members") {
    const allMembers = [
      {
        id: `${IDS.membership.slice(0, -1)}1`,
        role: "admin",
        job_title: "Administrator",
        organization_id: IDS.org,
        user_id: IDS.admin,
        active: true,
        organizations: orgEmbed(),
      },
      {
        id: `${IDS.membership.slice(0, -1)}2`,
        role: "employee",
        job_title: "DSP",
        organization_id: IDS.org,
        user_id: IDS.staff,
        active: true,
        organizations: orgEmbed(),
      },
      {
        id: `${IDS.membership.slice(0, -1)}3`,
        role: "employee",
        job_title: "DSP",
        organization_id: IDS.org,
        user_id: IDS.incompleteStaff,
        active: true,
        organizations: orgEmbed(),
      },
    ];
    const userEq = paramEq(url, "user_id");
    if (userEq) return allMembers.filter((m) => m.user_id === userEq);
    return allMembers;
  }

  if (table === "organizations") {
    return [{ id: IDS.org, dhhs_provider_id: "UT-E2E-1", ...orgEmbed() }];
  }

  if (table === "org_subscriptions") {
    return [{ organization_id: IDS.org, plan: "pro", status: "active", locked_at: null }];
  }

  if (table === "auditor_accounts" || table === "hive_executives") {
    return [];
  }

  if (table === "nectar_documents" || table === "policy_signatures") {
    return [];
  }

  if (table === "org_member_directory") {
    return members().map((m) => ({
      id: m.id,
      full_name: m.label,
      email: `${m.id}@hive.test`,
      username: m.label.toLowerCase().replace(/\s+/g, "."),
    }));
  }

  if (table === "role_permissions") {
    return [
      { organization_id: IDS.org, role: "admin", permission: "view_staff_records", enabled: true },
    ];
  }

  if (table === "clients") {
    return [clientRow()];
  }

  if (table === "staff_assignments") {
    return [
      {
        organization_id: IDS.org,
        staff_id: IDS.staff,
        client_id: IDS.client,
        service_codes: ["SLH", "SLN"],
      },
    ];
  }

  if (table === "evv_timesheets" || table === "scheduled_shifts" || table === "client_medications") {
    return [];
  }

  if (table === "hive_training_catalog") {
    return [
      {
        id: IDS.catalogFull,
        sku: "full_program",
        name: "Full Program",
        kind: "full_program",
        price_cents: 30000,
        currency: "USD",
        active: true,
        includes: ["CPR", "Mandt", "DSPD"],
        sort: 1,
        fulfills_course_ids: [IDS.course],
      },
      {
        id: IDS.catalogAla,
        sku: "dspd_orientation",
        name: "DSPD Provider Orientation",
        kind: "ala_carte",
        price_cents: 12500,
        currency: "USD",
        active: true,
        includes: ["DSPD"],
        sort: 2,
        fulfills_course_ids: [IDS.course],
      },
    ];
  }

  if (table === "hive_training_courses") {
    return [
      {
        id: IDS.course,
        title: "DSPD Provider Orientation",
        slug: "dspd-orientation",
        description: "Launchpad core orientation.",
        cert_validity_months: 12,
        baseline_key: "dspd_orientation",
      },
    ];
  }

  if (table === "hive_training_assignments") {
    const idEq = u.searchParams.get("id");
    const userEq = u.searchParams.get("user_id");
    const rows = [
      assignmentRow(IDS.assignment, "in_progress", IDS.staff),
      assignmentRow(IDS.assignmentLocked, "not_started", IDS.incompleteStaff),
    ];
    if (idEq?.startsWith("eq.")) {
      return rows.filter((r) => r.id === idEq.slice(3));
    }
    if (userEq?.startsWith("eq.")) {
      const uidFilter = userEq.slice(3);
      if (uidFilter === uid) {
        return [assignmentRow(IDS.assignment, "in_progress", uid)];
      }
      return rows.filter((r) => r.user_id === uidFilter);
    }
    if (world.role === "employee") {
      return [assignmentRow(IDS.assignment, "in_progress", uid)];
    }
    return rows;
  }

  if (table === "hive_training_course_modules") {
    return [
      {
        id: IDS.htModule,
        course_id: IDS.course,
        sort: 1,
        title: "Welcome to Launchpad",
        body_md: "This is the first Launchpad module. It is available.",
        video_url: null,
        quiz_json: null,
      },
      {
        id: "99999999-9999-4999-8999-999999999998",
        course_id: IDS.course,
        sort: 2,
        title: "Competency check",
        body_md: "Second module — still locked until the first is marked complete in a real session.",
        video_url: null,
        quiz_json: null,
      },
    ];
  }

  if (table === "hive_training_module_progress" || table === "hive_training_certificates" || table === "hive_training_seats") {
    return [];
  }

  if (table === "hive_training_auto_renew_settings") {
    return [];
  }

  if (table === "training_topics") {
    const idEq = u.searchParams.get("id");
    const rows = [
      {
        id: IDS.topicReady,
        code: "seizure_disorders",
        title: "Seizure disorders",
        description: "Recognize and respond to seizures.",
        category: "Emergencies & health",
        dspd_letter: "E",
        sort_order: 1,
        mindsmith_url: null,
        attestation_statement: "I completed this topic.",
      },
      {
        id: IDS.topicSoon,
        code: "agency_policies",
        title: "The agency's policies & procedures",
        description: "Coming soon — not yet available.",
        category: "Foundations & compliance",
        dspd_letter: "P",
        sort_order: 2,
        mindsmith_url: null,
        attestation_statement: "I completed this topic.",
      },
    ];
    if (idEq?.startsWith("eq.")) return rows.filter((r) => r.id === idEq.slice(3));
    return rows;
  }

  if (table === "training_topic_progress") {
    return [
      {
        user_id: uid,
        topic_kind: "core",
        ref_id: IDS.topicReady,
        status: "completed",
      },
    ];
  }

  if (table === "training_completions") {
    return [
      {
        id: "comp-1",
        user_id: uid,
        topic_kind: "core",
        ref_id: IDS.topicReady,
        typed_signature: "E2E Staff",
        completed_at: new Date().toISOString(),
        is_current: true,
      },
    ];
  }

  if (table === "training_modules") {
    const idEq = u.searchParams.get("id");
    const rows = [
      {
        id: IDS.trainingModule,
        title: "Orientation module",
        description: "A catalog training module.",
        sequence_order: 1,
        mindsmith_url: null,
      },
    ];
    if (idEq?.startsWith("eq.")) return rows.filter((r) => r.id === idEq.slice(3));
    return rows;
  }

  if (table === "user_training_progress" || table === "training_person_modules") {
    return [];
  }

  if (table === "feature_registry") {
    return featureRegistry();
  }

  if (table === "organization_features") {
    return [{ feature_key: "hive_training", enabled: true, updated_by: null, updated_at: null }];
  }

  if (table === "platform_states" || table === "behavior_support_clients" || table === "bc_behaviors") {
    return [];
  }

  return [];
}

function isWrite(method: string): boolean {
  return method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
}

export async function installHiveE2E(
  page: Page,
  world: HiveE2EWorld,
  writes: WriteAttempt[],
): Promise<void> {
  const session = sessionFor(world);
  const portalView = world.role === "admin" ? "admin" : "staff";

  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[e2e pageerror] ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      // eslint-disable-next-line no-console
      console.log(`[e2e console.error] ${msg.text()}`);
    }
  });

  await page.addInitScript(
    ({ sessionKey, sessionJson, portalView: view, orgId }) => {
      try {
        window.localStorage.setItem(sessionKey, sessionJson);
        window.localStorage.setItem("portal-view", view);
        window.localStorage.setItem("hive.activeOrgId", orgId);
      } catch {
        /* ignore */
      }
    },
    {
      sessionKey: SESSION_KEY,
      sessionJson: JSON.stringify(session),
      portalView,
      orgId: IDS.org,
    },
  );

  await page.route(`https://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
      return;
    }

    if (url.includes("/auth/v1/user")) {
      await fulfillJson(route, 200, session.user);
      return;
    }
    if (url.includes("/auth/v1/token") || url.includes("/auth/v1/session")) {
      await fulfillJson(route, 200, session);
      return;
    }
    if (url.includes("/auth/v1/logout") || url.includes("/realtime/")) {
      await fulfillJson(route, 200, {});
      return;
    }
    if (url.includes("/functions/v1/")) {
      await fulfillJson(route, 200, {});
      return;
    }

    const restIdx = url.indexOf("/rest/v1/");
    if (restIdx === -1) {
      await fulfillJson(route, 200, {});
      return;
    }

    const after = url.slice(restIdx + "/rest/v1/".length);
    const table = decodeURIComponent(after.split("?")[0] ?? "");

    if (table.startsWith("rpc/")) {
      const rpc = table.slice(4);
      if (rpc === "clients_for_staff" || rpc === "is_hive_executive") {
        if (rpc === "is_hive_executive") {
          await fulfillJson(route, 200, false);
          return;
        }
        await fulfillJson(route, 200, [clientRow()]);
        return;
      }
      await fulfillJson(route, 200, []);
      return;
    }

    if (isWrite(method)) {
      writes.push({ method, table, url });
      // Never forward completions or punches to the live database.
      if (
        table === "training_completions" ||
        table === "training_topic_progress" ||
        table === "hive_training_assignments" ||
        table === "hive_training_module_progress" ||
        table === "hive_training_certificates" ||
        table === "evv_timesheets" ||
        table === "user_training_progress"
      ) {
        await fulfillJson(route, 201, []);
        return;
      }
      await fulfillJson(route, 201, []);
      return;
    }

    const rows = restRows(world, table, url);
    if (method === "HEAD") {
      const count = rows.length;
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
          "content-range": count === 0 ? "*/0" : `0-${count - 1}/${count}`,
          "content-profile": "public",
        },
      });
      return;
    }
    if (wantsObject(req)) {
      if (rows.length === 1) {
        await fulfillJson(route, 200, rows[0]);
        return;
      }
      await fulfillJson(
        route,
        406,
        { code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" },
      );
      return;
    }
    const count = rows.length;
    await fulfillJson(route, 200, rows, {
      "content-range": count === 0 ? "*/0" : `0-${count - 1}/${count}`,
      "content-profile": "public",
    });
  });

  // Registered last so it wins. Dev server-fn IDs are base64url({ file, export }).
  await page.route(/\/_serverFn\//, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const meta = decodeServerFnMeta(url);
    // eslint-disable-next-line no-console
    console.log(`[e2e-mock] serverFn ${method} ${meta.exportName || url}`);

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
      return;
    }

    try {
      const payload = serverFnPayload(world, req);
      await fulfillJson(route, 200, wrapServerFnResult(payload));
    } catch (err) {
      const e = err as { status?: number; message?: string };
      await fulfillJson(route, 200, {
        error: e.message ?? "blocked",
      });
    }
  });
}

export const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
