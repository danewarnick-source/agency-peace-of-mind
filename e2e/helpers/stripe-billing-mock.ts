/**
 * Playwright mock for Stripe paywall / subscription / training charge skip.
 * Never hits live Supabase or Stripe.
 *
 * Server-fn IDs are base64url({ file, export }). Results must be { result: payload }
 * so createServerFn client middleware can unwrap them.
 */
import type { Page, Request, Route } from "@playwright/test";
import { ALL_PERMISSIONS } from "../../src/lib/rbac";

export const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
export const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
export const CATALOG_ALA = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
export const CATALOG_FULL = "cccccccc-cccc-cccc-cccc-ccccccccccc2";

const PROJECT_REF = "mmknqtdrefbzwfdtykza";
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export type BillingWorld = {
  billingExempt: boolean;
  orgName: string;
  locked: boolean;
  plan: "pro" | "enterprise" | "starter";
  status: string;
  trainingGranted?: boolean;
  lastTrainingCharge?: boolean;
};

export function tnsWorld(): BillingWorld {
  return {
    billingExempt: true,
    orgName: "True North Supports LLC",
    locked: false,
    plan: "enterprise",
    status: "active",
  };
}

export function unpaidWorld(): BillingWorld {
  return {
    billingExempt: false,
    orgName: "New Agency LLC",
    locked: true,
    plan: "pro",
    status: "paused",
  };
}

export function payingWorld(): BillingWorld {
  return {
    billingExempt: false,
    orgName: "Paying Agency LLC",
    locked: false,
    plan: "pro",
    status: "active",
  };
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function session() {
  const now = new Date().toISOString();
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "e2e.billing@example.com",
    email_confirmed_at: now,
    confirmed_at: now,
    last_sign_in_at: now,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "E2E Admin" },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    aud: "authenticated",
    sub: USER_ID,
    email: user.email,
    role: "authenticated",
    exp,
    iat: exp - 86400,
    iss: `https://${PROJECT_REF}.supabase.co/auth/v1`,
    session_id: "e2e-billing-session",
  })}.e2emock`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: 86400,
    expires_at: exp,
    refresh_token: "e2e-refresh",
    user,
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

function wrapServerFnResult(payload: unknown): unknown {
  return { result: payload };
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

function tableFromUrl(url: string): string | null {
  const m = url.match(/\/rest\/v1\/([a-z0-9_]+)/i);
  return m?.[1] ?? null;
}

function billingStatus(world: BillingWorld) {
  return {
    organizationId: ORG_ID,
    billingExempt: world.billingExempt,
    accessLocked: world.locked && !world.billingExempt,
    testMode: true,
    paymentsConfigured: true,
    paymentsMessage: null,
    plan: world.plan,
    status: world.status,
    mrrCents: world.billingExempt ? 0 : 49900,
    lockedAt: world.locked ? "2026-08-28T00:00:00.000Z" : null,
    lockReason: world.locked ? "Payment required to use Hive" : null,
    currentPeriodEnd: null,
    hasStripeCustomer: !world.locked && !world.billingExempt,
    orgName: world.orgName,
  };
}

function addonsFor(world: BillingWorld) {
  return world.billingExempt
    ? ["nectar_infusion", "internal_audit", "requirements_engine", "priority_support", "hive_training"]
    : ["nectar_infusion", "hive_training"];
}

function serverFnPayload(world: BillingWorld, req: Request): unknown {
  const url = req.url();
  const body = req.postData() ?? "";
  const meta = decodeServerFnMeta(url);
  const hay = `${url} ${body} ${meta.exportName} ${meta.file} ${meta.raw}`.toLowerCase();

  if (hay.includes("getbillingstatus")) return billingStatus(world);
  if (hay.includes("createsubscriptioncheckout")) {
    if (world.billingExempt) return { url: null, exempt: true, error: null };
    return { url: "https://checkout.stripe.com/c/pay/cs_test_e2e", exempt: false, error: null };
  }
  if (hay.includes("createtrainingcheckout")) {
    const ala = hay.includes(CATALOG_ALA) || hay.includes("ala_carte") || hay.includes("cpr");
    if (world.billingExempt || !ala) {
      world.trainingGranted = true;
      world.lastTrainingCharge = false;
      return { url: null, granted: true, error: null };
    }
    world.lastTrainingCharge = true;
    return {
      url: "https://checkout.stripe.com/c/pay/cs_test_training",
      granted: false,
      error: null,
    };
  }
  if (hay.includes("confirmcheckoutsession")) {
    world.locked = false;
    world.status = "active";
    world.trainingGranted = true;
    return { ok: true, error: null };
  }
  if (hay.includes("getmyentitlements")) {
    return {
      organization_id: ORG_ID,
      tier: world.billingExempt ? "enterprise" : world.plan,
      status: world.status,
      addons: addonsFor(world),
    };
  }
  if (hay.includes("getmyorgfeatures")) {
    return {
      organization_id: ORG_ID,
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
      registry: [],
    };
  }
  if (hay.includes("checkhiveexecutive")) return { isExecutive: false };
  if (hay.includes("listmypendingpolicies")) return { pending: [] };
  if (hay.includes("getinboxunread") || hay.includes("getpendingupgrade")) return { count: 0 };
  if (hay.includes("getactivedraftjobs")) return { jobs: [] };
  if (hay.includes("getmycestatus")) return { ceApplies: false };
  if (hay.includes("getmyotherassignments")) {
    return { open_count: 0, safety_critical_open_count: 0, total: 0, completed: 0 };
  }
  if (
    hay.includes("listcompanyobligations") ||
    hay.includes("getincident") ||
    hay.includes("listopensummaries") ||
    hay.includes("listdeadline") ||
    hay.includes("searchactivestaff") ||
    hay.includes("getpendingtrackingforms") ||
    hay.includes("getmytrainingenrollments") ||
    hay.includes("gettrainingproducts") ||
    hay.includes("getorgtrainingpurchases") ||
    hay.includes("getrostertrainingstatus") ||
    hay.includes("getmyclienttraining")
  ) {
    return [];
  }

  return {
    isExecutive: false,
    organization_id: ORG_ID,
    organizationId: ORG_ID,
    tier: world.billingExempt ? "enterprise" : world.plan,
    status: world.status,
    addons: addonsFor(world),
    effective: {
      hive_training: true,
      nectar: true,
      evv_timesheets: true,
      pcsp: true,
      client_intake: true,
      staff_onboarding: true,
    },
    registry: [],
    pending: [],
    ceApplies: false,
    count: 0,
    jobs: [],
    rows: [],
    ...billingStatus(world),
  };
}

function restRows(world: BillingWorld, table: string): unknown[] {
  if (table === "auditor_accounts") return [];
  if (table === "hive_executives") return [];
  if (table === "organization_members") {
    return [
      {
        id: "mem-1",
        organization_id: ORG_ID,
        user_id: USER_ID,
        role: "admin",
        job_title: "Admin",
        active: true,
        organizations: {
          name: world.orgName,
          is_demo: false,
          legal_name: world.orgName,
          dba_name: world.orgName,
          display_acronym: world.billingExempt ? "TNS" : "NEW",
        },
      },
    ];
  }
  if (table === "organizations") {
    return [
      {
        id: ORG_ID,
        name: world.orgName,
        legal_name: world.orgName,
        dba_name: world.orgName,
        billing_exempt: world.billingExempt,
        is_demo: false,
        display_acronym: world.billingExempt ? "TNS" : "NEW",
      },
    ];
  }
  if (table === "org_subscriptions") {
    return [
      {
        organization_id: ORG_ID,
        plan: world.plan,
        status: world.status,
        locked_at: world.locked ? "2026-08-28T00:00:00.000Z" : null,
        lock_reason: world.locked ? "Payment required to use Hive" : null,
        stripe_subscription_id: world.locked ? null : "sub_test",
        stripe_customer_id: world.locked ? null : "cus_test",
        mrr_cents: world.billingExempt ? 0 : 49900,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
  }
  if (table === "hive_training_catalog") {
    return [
      {
        id: CATALOG_FULL,
        sku: "full_program",
        name: "Full Training Program",
        kind: "full_program",
        price_cents: 30000,
        currency: "usd",
        active: true,
        fulfills_course_ids: [],
        sort: 1,
      },
      {
        id: CATALOG_ALA,
        sku: "cpr_first_aid",
        name: "CPR & First Aid",
        kind: "ala_carte",
        price_cents: 7500,
        currency: "usd",
        active: true,
        fulfills_course_ids: [],
        sort: 2,
      },
    ];
  }
  if (table === "hive_training_orders" || table === "hive_training_seats" || table === "hive_training_assignments") {
    return world.trainingGranted ? [{ id: "ord-1", status: "paid", organization_id: ORG_ID }] : [];
  }
  if (table === "org_member_directory") {
    return [{ id: USER_ID, full_name: "E2E Admin", email: "e2e.billing@example.com", username: "e2e" }];
  }
  if (table === "role_permissions") {
    return ALL_PERMISSIONS.map((perm) => ({ role: "admin", permission: perm }));
  }
  if (table === "profiles") {
    return [
      {
        id: USER_ID,
        email: "e2e.billing@example.com",
        full_name: "E2E Admin",
        has_passed_launchpad: true,
        must_change_password: false,
        staff_type_keys: [],
      },
    ];
  }
  return [];
}

export async function installStripeBillingMock(page: Page, world: BillingWorld) {
  const sess = session();

  await page.addInitScript(
    ({ storageKey, sessionJson, orgId }) => {
      window.localStorage.setItem(storageKey, sessionJson);
      window.localStorage.setItem("hive.activeOrgId", orgId);
      window.localStorage.setItem("portal-view", "admin");
    },
    { storageKey: AUTH_STORAGE_KEY, sessionJson: JSON.stringify(sess), orgId: ORG_ID },
  );

  await page.route(/supabase\.co/i, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Allow-Methods": "*",
        },
      });
      return;
    }
    if (url.includes("/auth/v1/")) {
      if (url.includes("/user")) {
        await fulfillJson(route, 200, sess.user);
        return;
      }
      await fulfillJson(route, 200, sess);
      return;
    }
    if (!url.includes("/rest/v1/")) {
      await route.continue();
      return;
    }
    const table = tableFromUrl(url);
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      if (
        table === "hive_training_orders" ||
        table === "hive_training_seats" ||
        table === "hive_training_assignments"
      ) {
        world.trainingGranted = true;
      }
      const posted = restRows(world, table ?? "");
      if (wantsObject(req)) {
        await fulfillJson(route, 201, posted[0] ?? { id: "e2e" });
        return;
      }
      await fulfillJson(route, 201, posted);
      return;
    }
    const rows = restRows(world, table ?? "");
    if (wantsObject(req)) {
      if (rows.length === 0) {
        await fulfillJson(route, 406, {
          code: "PGRST116",
          details: "The result contains 0 rows",
          message: "JSON object requested, multiple (or no) rows returned",
        });
        return;
      }
      await fulfillJson(route, 200, rows[0]);
      return;
    }
    const count = rows.length;
    await fulfillJson(route, 200, rows, {
      "content-range": count === 0 ? "*/0" : `0-${count - 1}/${count}`,
      "content-profile": "public",
    });
  });

  await page.route(/\/_serverFn\//, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
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
    const payload = serverFnPayload(world, req);
    await fulfillJson(route, 200, wrapServerFnResult(payload));
  });
}
