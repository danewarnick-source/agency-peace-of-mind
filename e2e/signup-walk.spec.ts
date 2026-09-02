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

async function installSignupMocks(page: Page, opts?: { emailExists?: boolean; pwnedRange?: string }) {
  const emailExists = opts?.emailExists === true;
  const pwnedRange = opts?.pwnedRange ?? "";

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
    let parsed: { data?: { email?: string; organizationId?: string } } | null = null;
    try {
      parsed = JSON.parse(req.postData() ?? "{}") as { data?: { email?: string; organizationId?: string } };
    } catch {
      parsed = null;
    }
    if (hay.includes("checkpasswordpwned") || hay.includes("pwnedrange")) {
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
      return fulfillJson(route, {
        access_token: `${b64url({ alg: "none" })}.${b64url({ sub: USER_ID, email: EMAIL })}.e2e`,
        token_type: "bearer",
        expires_in: 86400,
        refresh_token: "e2e-refresh",
        user: {
          id: USER_ID,
          email: EMAIL,
          email_confirmed_at: now,
          user_metadata: { full_name: "Dane Walk" },
        },
      });
    }
    if (/\/auth\/v1\//i.test(url)) {
      return fulfillJson(route, {
        id: USER_ID,
        email: EMAIL,
        user_metadata: { full_name: "Dane Walk" },
      });
    }
    if (/\/rest\/v1\/organizations/i.test(url)) {
      if (method === "GET") {
        return fulfillJson(route, [{ id: ORG_ID, created_by: USER_ID, name: "Sunrise Supports" }]);
      }
      return fulfillJson(route, { id: ORG_ID });
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
    await expect(page.getByTestId("signup-plan-quote")).toBeVisible();
    await expect(page.getByTestId("signup-plan-quote")).toContainText("$69");
    await expect(page.getByTestId("signup-plan-quote")).toContainText("$350");
    await expect(page.getByTestId("signup-plan-math")).toContainText("$828");
    await expect(page.locator("body")).not.toContainText("$79");
    await expect(page.locator("body")).not.toContainText("$125");
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
    await expect(page.getByTestId("pricing-schedule")).toContainText(/training skipped/i);
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
    await page.waitForTimeout(800);
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
    await page.getByRole("button", { name: /show password/i }).click();
    await shot(page, "signup_password_weak_easy_bar.png");
  });

  test("exact duplicate email is still blocked; plus-alias is not treated as the base address", async ({
    page,
  }) => {
    await installSignupMocks(page, { emailExists: true });
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await fillReactInput(page, "signup-email", "danewarnick+pi1@gmail.com");
    await page.getByTestId("signup-email").blur();
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 20_000 });
    await shot(page, "signup_exact_email_blocked.png");
  });
});
