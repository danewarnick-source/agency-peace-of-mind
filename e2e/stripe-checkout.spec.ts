/**
 * Stripe paywall + training purchase e2e (mocked Stripe / Supabase).
 *
 * Proves:
 *  a) billing-exempt True North can use Hive with no Checkout
 *  b) a non-exempt org is blocked until checkout/webhook unlock
 *  c) extra training is skipped for exempt; a-la-carte still offers pay for a paying org
 *
 * Also hits the real webhook HTTP route (unsigned → 400/503).
 *
 * Run: npx playwright test --config=playwright.stripe.config.ts
 */
import { test, expect } from "@playwright/test";
import {
  installStripeBillingMock,
  payingWorld,
  tnsWorld,
  unpaidWorld,
} from "./helpers/stripe-billing-mock";

test("a) billing-exempt TNS can use the app with no Checkout", async ({ page }) => {
  await installStripeBillingMock(page, tnsWorld());
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/billing-locked/);
  await page.goto("/dashboard/billing/subscription", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hive-subscription-page")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("comped-note")).toBeVisible();
  await expect(page.getByText(/True North Supports/i).first()).toBeVisible();
  await expect(page.getByTestId("pay-with-stripe")).toHaveCount(0);
});

test("b) unpaid org is locked until checkout succeeds", async ({ page }) => {
  const world = unpaidWorld();
  await installStripeBillingMock(page, world);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/billing-locked/, { timeout: 25_000 });
  await expect(page.getByTestId("billing-paywall")).toBeVisible();
  await expect(page.getByTestId("stripe-test-mode-hint")).toBeVisible();
  await expect(page.getByTestId("pay-with-stripe")).toBeVisible();

  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ status: 200, body: "stripe checkout stub" }),
  );
  await page.getByTestId("pay-with-stripe").click();
  await page.waitForTimeout(400);

  // Simulate webhook / confirmCheckoutSession unlocking the org.
  world.locked = false;
  world.status = "active";
  await page.goto("/dashboard/billing/subscription?checkout=success&session_id=cs_test_e2e", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("hive-subscription-page")).toBeVisible({ timeout: 25_000 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/billing-locked/);
});

test("c) training extra is skipped for exempt and charged for a paying org", async ({ page }) => {
  const exempt = tnsWorld();
  await installStripeBillingMock(page, exempt);
  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /Add included training/i }).first().click();
  await page.getByTestId("training-checkout-confirm").click();
  await expect(page).not.toHaveURL(/checkout\.stripe\.com/);
  await expect.poll(() => exempt.lastTrainingCharge === false || exempt.trainingGranted === true).toBeTruthy();

  const paying = payingWorld();
  await installStripeBillingMock(page, paying);
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "stripe checkout stub" }),
  );
  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/CPR/i).first()).toBeVisible();
  await page.getByRole("button", { name: /^Buy$/i }).first().click();
  await page.getByTestId("training-checkout-confirm").click();
  await expect.poll(() => paying.lastTrainingCharge === true).toBeTruthy();
});

test("webhook route rejects unsigned events", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", {
    data: JSON.stringify({ type: "checkout.session.completed" }),
    headers: { "content-type": "application/json" },
  });
  expect([400, 503]).toContain(res.status());
});
