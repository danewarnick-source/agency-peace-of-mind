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
  await page.goto("/dashboard?checkout=success&session_id=cs_test_e2e", {
    waitUntil: "domcontentloaded",
  });
  await expect(page).not.toHaveURL(/billing-locked/, { timeout: 25_000 });
  await page.goto("/billing-locked?checkout=success&session_id=cs_test_e2e", {
    waitUntil: "domcontentloaded",
  });
  await expect(page).not.toHaveURL(/billing-locked/, { timeout: 25_000 });
});

test("c) training extra is skipped for exempt and charged for a paying org", async ({ page }) => {
  const exempt = tnsWorld();
  await installStripeBillingMock(page, exempt);
  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("training-price-full_program")).toContainText("$300");
  await expect(page.getByTestId("training-price-cpr_first_aid")).toContainText("$100");
  await expect(page.getByTestId("training-price-mandt")).toContainText("$200");
  await expect(page.getByTestId("training-price-dspd_required")).toContainText("$75");
  await expect(page.getByTestId("training-price-full_program")).toContainText(/True North \$0/);
  await expect(page.getByTestId("training-subtab-internal")).toBeVisible();
  await page.getByTestId("training-subtab-internal").click();
  await expect(page.getByTestId("internal-trainings-panel")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal trainings" })).toBeVisible();
  await page.getByTestId("training-subtab-classes").click();
  await page.getByTestId("training-buy-full_program").click();
  await expect(page.getByTestId("training-roster-name-0")).toBeVisible();
  await expect(page.getByTestId("training-roster-multiselect")).toBeVisible();
  await page.getByTestId("training-roster-select-all").click();
  await page.getByTestId("training-roster-add-selected").click();
  await expect(page.getByTestId("training-roster-name-0")).toHaveValue("E2E Admin");
  await expect(page.getByTestId("training-roster-email-0")).toHaveValue("e2e.billing@example.com");
  const tnsPhone = page.getByTestId("training-roster-phone-0");
  if (!(await tnsPhone.inputValue())) {
    await tnsPhone.fill("801-555-0100");
  }
  await expect(page.getByTestId("training-roster-list-price")).toContainText("$300");
  await expect(page.getByTestId("training-roster-total")).toContainText(/True North \$0/);
  await page.getByTestId("training-roster-submit").click();
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
  await expect(page.getByTestId("training-price-cpr_first_aid")).toContainText("$100");
  await expect(page.getByTestId("training-price-cpr_first_aid")).not.toContainText(/True North \$0/);
  await page.getByTestId("training-buy-cpr_first_aid").click();
  await expect(page.getByTestId("training-roster-name-0")).toBeVisible();
  await page.getByTestId("training-roster-name-0").fill("Pay Staff");
  await page.getByTestId("training-roster-email-0").fill("pay.staff@hive.test");
  await page.getByTestId("training-roster-phone-0").fill("801-555-0199");
  await page.getByTestId("training-roster-submit").click();
  await expect.poll(() => paying.lastTrainingCharge === true).toBeTruthy();
});

test("webhook route rejects unsigned events", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", {
    data: JSON.stringify({ type: "checkout.session.completed" }),
    headers: { "content-type": "application/json" },
  });
  expect([400, 503]).toContain(res.status());
});
