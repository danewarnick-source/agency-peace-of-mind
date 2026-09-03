import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canWritePaidSubscriptionPrivileged,
  paidOrgSubscriptionCore,
  paidOrgSubscriptionPatch,
} from "./org-subscription-row.ts";
import { TNS_ORGANIZATION_ID } from "./current-org.ts";
import { isBillingExempt } from "./billing-access.ts";

describe("paidOrgSubscriptionPatch", () => {
  it("writes status=active with locked_at null and Stripe ids", () => {
    const patch = paidOrgSubscriptionPatch({
      orgId: "11111111-1111-1111-1111-111111111111",
      plan: "hive_standard",
      customerId: "cus_test",
      subscriptionId: "sub_test",
      paymentIntentId: "pi_test",
      amountCents: 35000,
      periodEndIso: "2026-10-03T00:00:00.000Z",
      eventId: "checkout_confirm:cs_test",
      staffCount: 2,
      billingInterval: "monthly",
      monthlyCents: 35000,
    });
    assert.equal(patch.status, "active");
    assert.equal(patch.plan, "hive_standard");
    assert.equal(patch.locked_at, null);
    assert.equal(patch.lock_reason, null);
    assert.equal(patch.stripe_customer_id, "cus_test");
    assert.equal(patch.stripe_subscription_id, "sub_test");
    const core = paidOrgSubscriptionCore("11111111-1111-1111-1111-111111111111", patch);
    assert.equal(core.organization_id, "11111111-1111-1111-1111-111111111111");
    assert.equal(core.status, "active");
    assert.equal(core.locked_at, null);
  });
});

describe("True North is never given a paid row from confirm/webhook", () => {
  it("exempt check still matches TNS id and name", () => {
    assert.equal(
      isBillingExempt({
        billingExempt: false,
        orgName: "True North Supports",
        organizationId: TNS_ORGANIZATION_ID,
        subscription: null,
      }),
      true,
    );
  });
});

describe("privileged writer does not invent env names", () => {
  it("is false with only VITE_ public names", () => {
    assert.equal(
      canWritePaidSubscriptionPrivileged({
        VITE_SUPABASE_URL: "https://preview.supabase.co",
        VITE_SUPABASE_ANON_KEY: "vite-anon-key",
      }),
      false,
    );
  });

  it("is true when the existing service-role name is already set", () => {
    assert.equal(
      canWritePaidSubscriptionPrivileged({
        VITE_SUPABASE_URL: "https://preview.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      }),
      true,
    );
  });
});

describe("confirm and webhook share the upsert", () => {
  it("confirmCheckout upserts via activateSubscriptionFromCheckout", () => {
    const checkout = readFileSync(new URL("./stripe-checkout.functions.ts", import.meta.url), "utf8");
    const start = checkout.indexOf("export const confirmCheckoutSessionFn");
    const end = checkout.indexOf("type TrainingCheckoutInput");
    assert.ok(start >= 0 && end > start);
    const handler = checkout.slice(start, end);
    assert.match(handler, /activateSubscriptionFromCheckout/);
    assert.match(handler, /expand: \["subscription"\]/);
    assert.match(handler, /client_reference_id/);
  });

  it("webhook uses the same activate helper", () => {
    const webhook = readFileSync(new URL("./stripe-webhook.ts", import.meta.url), "utf8");
    assert.match(webhook, /activateSubscriptionFromCheckout/);
    const activate = readFileSync(new URL("./org-subscription-activate.ts", import.meta.url), "utf8");
    assert.match(activate, /\.upsert\(/);
    assert.match(activate, /onConflict: "organization_id"/);
    assert.match(activate, /exempt_org/);
  });

  it("billing-locked leaves on confirm ok without waiting for webhook", () => {
    const page = readFileSync(new URL("../routes/billing-locked.tsx", import.meta.url), "utf8");
    const confirmAt = page.indexOf("confirmFn");
    const navAt = page.indexOf('navigate({ to: "/dashboard", replace: true })');
    assert.ok(confirmAt > 0 && navAt > confirmAt);
    assert.match(page, /checkout-confirm-error/);
  });
});
