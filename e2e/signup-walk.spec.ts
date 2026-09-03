/**
 * New-provider signup walk — mocked auth/billing so CI never creates users
 * or charges Stripe. Screenshots are for Dane's review.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ARTIFACTS = "/opt/cursor/artifacts";
const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
const EMAIL = "danewarnick+pi1@gmail.com";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function decodeServerFnMeta(url: string): string {
  try {
    const pathName = new URL(url).pathname;
    const marker = "/_serverFn/";
    const idx = pathName.indexOf(marker);
    if (idx < 0) return "";
    const fnId = decodeURIComponent(pathName.slice(idx + marker.length).split("/")[0] ?? "");
    const raw = Buffer.from(fnId, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { export?: string };
    return (parsed.export ?? "").toLowerCase();
  } catch {
    return "";
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    },
    body: JSON.stringify(body),
  });
}

function isServerFn(req: { url: () => string; headers: () => Record<string, string> }) {
  const headers = req.headers();
  const url = req.url();
  const tsr = headers["x-tsr-serverfn"] ?? headers["x-tsr-serverFn"];
  if (/\.(js|css|ts|tsx|mjs)(\?|$)/i.test(url)) return false;
  return tsr === "true" || url.includes("/_serverFn");
}

function serverFnHay(req: { url: () => string; postData: () => string | null }) {
  const url = req.url();
  const body = req.postData() ?? "";
  return `${url} ${decodeServerFnMeta(url)} ${body}`.toLowerCase();
}

async function installSignupMocks(
  page: Page,
  opts?: {
    emailExists?: boolean;
    pwnedRange?: string;
    signUpNoSession?: boolean;
    orgPatchOmitsPhone?: boolean;
    smsPhoneServerFn500?: boolean;
  },
) {
  const emailExists = opts?.emailExists === true;
  const pwnedRange = opts?.pwnedRange ?? "";
  const signUpNoSession = opts?.signUpNoSession === true;
  const orgPatchOmitsPhone = opts?.orgPatchOmitsPhone === true;
  const smsPhoneServerFn500 = opts?.smsPhoneServerFn500 === true;

  const handleServerFn = async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    }
    const hay = serverFnHay(req);
    let parsed: {
      data?: { email?: string; organizationId?: string; sha1Prefix?: string; agencyName?: string };
    } | null = null;
    try {
      parsed = JSON.parse(req.postData() ?? "{}") as {
        data?: { email?: string; organizationId?: string; sha1Prefix?: string; agencyName?: string };
      };
    } catch {
      parsed = null;
    }
    if (hay.includes("ensuresignupworkspace") || typeof parsed?.data?.agencyName === "string") {
      return fulfillJson(route, { result: { ok: true, orgId: ORG_ID, reason: null } });
    }
    if (
      hay.includes("checkpasswordpwned") ||
      hay.includes("pwnedrange") ||
      typeof parsed?.data?.sha1Prefix === "string"
    ) {
      return fulfillJson(route, { result: { range: pwnedRange } });
    }
    if (
      hay.includes("checkemailexists") ||
      (typeof parsed?.data?.email === "string" && !parsed?.data?.organizationId)
    ) {
      return fulfillJson(route, { result: { exists: emailExists } });
    }
    if (hay.includes("getsignuppaymentsstatus")) {
      return fulfillJson(route, {
        result: {
          paymentsConfigured: true,
          testMode: true,
          liveBlocked: false,
          message: null,
        },
      });
    }
    if (hay.includes("setbillingsmsphone")) {
      if (smsPhoneServerFn500) {
        return fulfillJson(
          route,
          {
            status: 500,
            unhandled: true,
            message:
              "Server function info not found for 81909d505cfb3331d5d9a7438f345a15a0a3c55b2b3c3edef8d6e7a316ade347",
          },
          500,
        );
      }
      return fulfillJson(route, { result: { ok: true, phone: "+18015550123" } });
    }
    if (hay.includes("createsubscriptioncheckout")) {
      return fulfillJson(route, {
        result: {
          url: "https://checkout.stripe.com/c/pay/cs_test_signup_walk",
          exempt: false,
          error: null,
        },
      });
    }
    return fulfillJson(route, { result: {} });
  };

  const handleSupabase = async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    }
    if (/\/auth\/v1\/signup/i.test(url) && method === "POST") {
      const now = new Date().toISOString();
      const user = {
        id: USER_ID,
        email: EMAIL,
        email_confirmed_at: signUpNoSession ? null : now,
        user_metadata: { full_name: "Dane Walk" },
      };
      if (signUpNoSession) {
        return fulfillJson(route, { user, session: null });
      }
      const access_token = `${b64url({ alg: "none" })}.${b64url({ sub: USER_ID, email: EMAIL })}.e2e`;
      const session = {
        access_token,
        token_type: "bearer",
        expires_in: 86400,
        refresh_token: "e2e-refresh",
        user,
      };
      return fulfillJson(route, { ...session, session, user });
    }
    if (/\/auth\/v1\//i.test(url)) {
      return fulfillJson(route, {
        id: USER_ID,
        email: EMAIL,
        user_metadata: { full_name: "Dane Walk" },
      });
    }
    if (/\/rest\/v1\/organization_members/i.test(url)) {
      return fulfillJson(route, {
        organization_id: ORG_ID,
        user_id: USER_ID,
        role: "admin",
        active: true,
      });
    }
    if (/\/rest\/v1\/organizations/i.test(url)) {
      const orgRow = {
        id: ORG_ID,
        created_by: USER_ID,
        name: "Sunrise Supports",
        account_contact_name: "Dane Walk",
        billing_sms_phone: orgPatchOmitsPhone ? null : "+18015550123",
        state_code: "UT",
      };
      if (method === "GET") {
        return fulfillJson(route, [orgRow]);
      }
      return fulfillJson(route, orgRow);
    }
    if (/\/rest\/v1\/profiles/i.test(url)) {
      return fulfillJson(route, { id: USER_ID, email: EMAIL });
    }
    return route.continue();
  };

  await page.route(/supabase\.co/i, handleSupabase);
  await page.route(/_serverFn/, handleServerFn);
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):\d+\//, async (route) => {
    const req = route.request();
    if (/\.(js|css|ts|tsx|mjs|map)(\?|$)/i.test(req.url())) return route.continue();
    if (req.resourceType() === "script" || req.resourceType() === "stylesheet") return route.continue();
    if (isServerFn(req)) return handleServerFn(route);
    return route.continue();
  });
}

async function walkToTraining(page: Page) {
  await fillReactInput(page, "signup-email", EMAIL);
  await fillReactInput(page, "signup-password", "Testpass1");
  await fillReactInput(page, "signup-confirm", "Testpass1");
  await page.getByTestId("signup-tos-checkbox").check();
  await page.getByTestId("signup-baa-checkbox").check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/tell us about your business/i)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("signup-agency-name").fill("Sunrise Supports");
  await page.getByPlaceholder("Jane Doe").fill("Dane Walk");
  await page.getByPlaceholder("(801) 555-0123").fill("8015550123");
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByTestId("signup-plan-quote")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByTestId("signup-training-step")).toBeVisible();
}

async function fillReactInput(page: Page, testId: string, value: string) {
  const loc = page.getByTestId(testId);
  await loc.waitFor({ state: "visible" });
  await loc.click();
  await loc.press("Control+A");
  await loc.press("Backspace");
  await loc.pressSequentially(value, { delay: 15 });
}

async function shot(page: Page, name: string) {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACTS, name),
    fullPage: true,
  });
}

test.describe("new-provider signup walk", () => {
  test("plus-alias, list plan, optional training, TEST MODE", async ({ page }) => {
    await installSignupMocks(page);
    await page.goto("/signup", { waitUntil: "networkidle" });
    await expect(page.getByTestId("signup-new-agency")).toBeVisible();
    await expect(page.getByTestId("signup-email")).toBeVisible();

    await fillReactInput(page, "signup-email", EMAIL);
    await fillReactInput(page, "signup-password", "Testpass1");
    await fillReactInput(page, "signup-confirm", "Testpass1");
    await page.getByTestId("signup-email").blur();
    await expect(page.getByTestId("signup-tos-checkbox")).toBeVisible();
    await expect(page.getByTestId("signup-tos-link")).toHaveAttribute("href", "/terms");
    await expect(page.getByTestId("signup-baa-checkbox")).toBeVisible();
    await expect(page.getByTestId("signup-baa-link")).toHaveAttribute("href", "/baa");
    await expect(page.getByRole("button", { name: /create account/i })).toBeDisabled();
    await page.getByTestId("signup-tos-checkbox").check();
    await expect(page.getByRole("button", { name: /create account/i })).toBeDisabled();
    await page.getByTestId("signup-baa-checkbox").check();
    await shot(page, "signup_step_account_plus_alias.png");
    await expect(page.getByRole("button", { name: /create account/i })).toBeEnabled();

    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/tell us about your business/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("signup-agency-name")).toHaveAttribute("placeholder", "Your agency name");
    await expect(page.getByTestId("signup-agency-name")).not.toHaveAttribute("placeholder", /True North/i);
    await page.getByTestId("signup-agency-name").fill("Sunrise Supports");
    await page.getByPlaceholder("Jane Doe").fill("Dane Walk");
    await page.getByPlaceholder("(801) 555-0123").fill("8015550123");
    await shot(page, "signup_step_agency_not_true_north.png");

    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByTestId("signup-plan-quote")).toBeVisible({ timeout: 15_000 });
    await shot(page, "signup_business_continue_ok.png");
    await expect(page.getByTestId("signup-plan-quote")).toContainText("$69");
    await expect(page.getByTestId("signup-plan-quote")).toContainText("$350");
    await expect(page.getByTestId("signup-plan-math")).toContainText("$828");
    await expect(page.locator("body")).not.toContainText("$79");
    await expect(page.locator("body")).not.toContainText("$125");
    await expect(page.locator("body")).not.toContainText("$500");
    await expect(page.locator("body")).not.toContainText("$299");
    await expect(page.locator("body")).not.toContainText(/founding/i);
    await shot(page, "signup_step_plan_69_350.png");

    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByTestId("signup-training-step")).toBeVisible();
    await expect(page.getByTestId("signup-training-cpr_first_aid")).toContainText("$100");
    await expect(page.getByTestId("signup-training-thirty_day")).toContainText("$75");
    await expect(page.getByTestId("signup-training-mandt")).toContainText("$200");
    await expect(page.getByTestId("signup-training-pack")).toContainText("$300");
    await expect(page.getByTestId("signup-training-skip")).toBeVisible();
    await shot(page, "signup_step_training_optional.png");

    await page.getByTestId("signup-training-skip").click();
    await expect(page.getByTestId("stripe-test-mode-hint")).toBeVisible();
    await expect(page.getByTestId("stripe-test-mode-hint")).toContainText("4242 4242 4242 4242");
    await expect(page.getByTestId("pricing-schedule")).toContainText("$828");
    await expect(page.getByTestId("pricing-schedule")).toContainText("$69");
    await expect(page.getByTestId("pricing-schedule")).toContainText("$350");
    await expect(page.getByTestId("pricing-schedule")).toContainText(/training skipped/i);
    await expect(page.locator("body")).not.toContainText("$79");
    await expect(page.locator("body")).not.toContainText("$125");
    await expect(page.locator("body")).not.toContainText("$500");
    await expect(page.locator("body")).not.toContainText("$299");
    await expect(page.locator("body")).not.toContainText(/founding/i);
    await shot(page, "signup_step_payment_test_mode.png");

    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body style="font-family:system-ui;padding:48px;background:#f6f9fc">
          <h1>Stripe Checkout (test stub)</h1>
          <p>TEST MODE — 4242 4242 4242 4242</p>
          <p>Provider Interface · 12 clients · $69/client ($350 min) — $828.00 / month</p>
        </body></html>`,
      }),
    );
    await page.getByRole("button", { name: /pay with stripe/i }).click();
    await expect(page.getByRole("heading", { name: /stripe checkout/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("body")).toContainText("$69/client");
    await expect(page.locator("body")).toContainText("$350");
    await expect(page.locator("body")).toContainText("$828.00");
    await expect(page.locator("body")).not.toContainText("$125");
    await expect(page.locator("body")).not.toContainText("$79");
    await expect(page.locator("body")).not.toContainText("$299");
    await expect(page.locator("body")).not.toContainText("$500");
    await shot(page, "signup_checkout_path_69_350.png");
  });

  test("pwned password shows Auth weak/easy bar before submit", async ({ page }) => {
    const password = "Password1";
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    await installSignupMocks(page, { pwnedRange: `${sha1.slice(5)}:99\n` });
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await fillReactInput(page, "signup-email", EMAIL);
    await fillReactInput(page, "signup-password", password);
    await page.getByTestId("signup-password").blur();
    await expect(page.getByTestId("signup-password-weak")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("signup-password-weak")).toContainText(
      "Password is known to be weak and easy to guess, please choose a different one.",
    );
    await expect(page.getByRole("button", { name: /create account/i })).toBeDisabled();
    await page.getByTestId("signup-password").locator("..").getByRole("button", { name: /show password/i }).click();
    await shot(page, "signup_password_weak_easy_bar.png");
  });

  test("confirm-email signup stays on Account and does not show the workspace toast", async ({ page }) => {
    await installSignupMocks(page, { signUpNoSession: true });
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await fillReactInput(page, "signup-email", EMAIL);
    await fillReactInput(page, "signup-password", "Testpass1");
    await fillReactInput(page, "signup-confirm", "Testpass1");
    await page.getByTestId("signup-tos-checkbox").check();
    await page.getByTestId("signup-baa-checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByTestId("signup-confirm-email")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("signup-confirm-email")).toContainText(/confirm the email we sent/i);
    await expect(page.getByText(/tell us about your business/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/workspace isn't ready/i);
    await shot(page, "signup_confirm_email_before_continue.png");
  });

  test("exact duplicate email is still blocked; plus-alias is not treated as the base address", async ({
    page,
  }) => {
    await installSignupMocks(page, { emailExists: true });
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await fillReactInput(page, "signup-email", "danewarnick+pi1@gmail.com");
    await page.getByTestId("signup-email").blur();
    await expect(page.getByText(/already in use/i)).toBeVisible({ timeout: 20_000 });
    await shot(page, "signup_exact_email_blocked.png");
  });

  test("training roster is per person: 1 CPR, 3 Pack, 1 thirty-day", async ({ page }) => {
    await installSignupMocks(page);
    await page.goto("/signup", { waitUntil: "networkidle" });
    await walkToTraining(page);
    await expect(page.getByText(/add who needs training, or skip/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/take one add-on/i);

    const rows: Array<{ name: string; sku: "cpr_first_aid" | "pack" | "thirty_day" }> = [
      { name: "Alex CPR", sku: "cpr_first_aid" },
      { name: "Blair Pack", sku: "pack" },
      { name: "Casey Pack", sku: "pack" },
      { name: "Drew Pack", sku: "pack" },
      { name: "Evan Thirty", sku: "thirty_day" },
    ];
    for (let i = 0; i < rows.length; i++) {
      await page.getByTestId("signup-training-add").click();
      await page.getByTestId(`signup-training-name-${i}`).fill(rows[i].name);
      await page.getByTestId(`signup-training-sku-${i}-${rows[i].sku}`).check();
    }
    await expect(page.getByTestId("signup-training-total")).toContainText("$1,075");
    await expect(page.getByTestId("signup-training-total")).toContainText("1× CPR");
    await expect(page.getByTestId("signup-training-total")).toContainText("3× Pack");
    await expect(page.getByTestId("signup-training-total")).toContainText("1× 30-day");
    await shot(page, "signup_step_training_roster_dane.png");

    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByTestId("signup-payment-training")).toBeVisible();
    await expect(page.getByTestId("signup-payment-training")).toContainText("CPR / First Aid × 1");
    await expect(page.getByTestId("signup-payment-training")).toContainText("Pack × 3");
    await expect(page.getByTestId("signup-payment-training")).toContainText("30-day × 1");
    await expect(page.getByTestId("signup-payment-training")).toContainText("$1,075");
    await page.getByRole("button", { name: /^back$/i }).click();
    await expect(page.getByTestId("signup-training-step")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("signup-nav")).toBeVisible();
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
    await expect(page.getByTestId("signup-training-skip")).toBeVisible();
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible();
    await shot(page, "signup_step_training_mobile_footer.png");
  });

  test("Business Continue stays on the step when the phone write fails", async ({ page }) => {
    await installSignupMocks(page, { orgPatchOmitsPhone: true, smsPhoneServerFn500: true });
    await page.goto("/signup", { waitUntil: "networkidle" });
    await fillReactInput(page, "signup-email", EMAIL);
    await fillReactInput(page, "signup-password", "Testpass1");
    await fillReactInput(page, "signup-confirm", "Testpass1");
    await page.getByTestId("signup-tos-checkbox").check();
    await page.getByTestId("signup-baa-checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/tell us about your business/i)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("signup-agency-name").fill("Sunrise Supports");
    await page.getByPlaceholder("Jane Doe").fill("Dane Walk");
    await page.getByPlaceholder("(801) 555-0123").fill("8015550123");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/couldn't save your business details/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/tell us about your business/i)).toBeVisible();
    await expect(page.getByTestId("signup-plan-quote")).toHaveCount(0);
    await shot(page, "signup_business_phone_write_blocked.png");
  });

  test("terms and BAA pages name Provider Interface LLC", async ({ page }) => {
    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^terms$/i })).toBeVisible();
    await expect(page.locator("body")).toContainText("Provider Interface LLC");
    await expect(page.getByTestId("terms-contracts")).toContainText("Contracts, funders, and audits");
    await shot(page, "signup_terms_pi_llc.png");

    await page.goto("/baa", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /business associate agreement/i })).toBeVisible();
    await expect(page.locator("body")).toContainText("Provider Interface LLC");
    await expect(page.getByTestId("baa-agree-checkbox")).toBeVisible();
    await expect(page.getByTestId("baa-agree-copy")).toContainText("authorized to bind this agency");
    await page.getByTestId("baa-agree-checkbox").check();
    await shot(page, "signup_baa_i_agree.png");
  });
});
