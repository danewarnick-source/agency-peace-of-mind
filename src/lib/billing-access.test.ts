import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBillingExempt,
  orgAccessIsLocked,
  orgLooksLikeTrueNorth,
  trainingRequiresCharge,
  entitlementsForOrg,
} from "./billing-access.ts";
import { isPublicSelfServeTier, normalizeTierId, PUBLIC_SELF_SERVE_TIERS } from "./hive-tiers.ts";
import {
  isStripeLiveSecretKey,
  isStripeTestPublishableKey,
  stripePaymentsConfigured,
  stripeClientConfigured,
  stripePriceIdForTrainingSku,
  stripeSeatPriceForQuote,
  subscriptionLineItemsForQuote,
  readStripeEnv,
  STRIPE_SANDBOX_PRICE_IDS,
} from "./stripe-config.ts";
import { quoteHiveSubscription } from "./hive-pricing.ts";

describe("billing-access", () => {
  it("True North name match is exempt even without the flag", () => {
    assert.equal(orgLooksLikeTrueNorth(["True North Supports LLC"]), true);
    assert.equal(
      isBillingExempt({
        billingExempt: false,
        orgName: "True North Supports",
        legalName: "True North Supports LLC",
      }),
      true,
    );
  });

  it("does not treat other agencies as True North", () => {
    assert.equal(
      isBillingExempt({
        billingExempt: false,
        orgName: "Acme DSPD Agency",
        legalName: "Acme LLC",
      }),
      false,
    );
  });

  it("billing_exempt flag comps any company", () => {
    assert.equal(
      isBillingExempt({
        billingExempt: true,
        orgName: "Dane Test Org",
      }),
      true,
    );
  });

  it("TNS / exempt orgs are never locked", () => {
    assert.equal(
      orgAccessIsLocked({
        billingExempt: true,
        orgName: "Dane Comp",
        subscription: { status: "paused", locked_at: "2026-08-01T00:00:00.000Z" },
      }),
      false,
    );
    assert.equal(
      orgAccessIsLocked({
        billingExempt: false,
        orgName: "True North Supports LLC",
        subscription: null,
      }),
      false,
    );
  });

  it("new unpaid org with no subscription row is locked", () => {
    assert.equal(
      orgAccessIsLocked({
        billingExempt: false,
        orgName: "New Agency",
        subscription: null,
      }),
      true,
    );
  });

  it("paused without Stripe subscription is locked (awaiting first payment)", () => {
    assert.equal(
      orgAccessIsLocked({
        billingExempt: false,
        orgName: "New Agency",
        subscription: { status: "paused", locked_at: null, stripe_subscription_id: null },
      }),
      true,
    );
  });

  it("active paid org is not locked", () => {
    assert.equal(
      orgAccessIsLocked({
        billingExempt: false,
        orgName: "Paying Agency",
        subscription: {
          status: "active",
          locked_at: null,
          stripe_subscription_id: "sub_test",
        },
      }),
      false,
    );
  });

  it("exempt orgs get full Enterprise addons", () => {
    const e = entitlementsForOrg({ billingExempt: true, plan: "starter" });
    assert.equal(e.tier, "enterprise");
    assert.ok(e.addons.includes("hive_training"));
    assert.ok(e.addons.includes("nectar_infusion"));
  });

  it("hive_standard maps to Hive (pro entitlements), not a $499 plan", () => {
    assert.equal(normalizeTierId("hive_standard"), "pro");
    const e = entitlementsForOrg({ billingExempt: false, plan: "hive_standard" });
    assert.equal(e.tier, "pro");
    assert.ok(e.addons.includes("hive_training"));
  });

  it("training is always charged unless the company is exempt", () => {
    assert.equal(
      trainingRequiresCharge({
        billingExempt: false,
        hasHiveTrainingAddon: true,
        catalogKind: "full_program",
        priceCents: 30000,
      }),
      true,
    );
    assert.equal(
      trainingRequiresCharge({
        billingExempt: false,
        hasHiveTrainingAddon: true,
        catalogKind: "ala_carte",
        priceCents: 7500,
      }),
      true,
    );
    assert.equal(
      trainingRequiresCharge({
        billingExempt: true,
        hasHiveTrainingAddon: true,
        catalogKind: "ala_carte",
        priceCents: 7500,
      }),
      false,
    );
  });

  it("Enterprise is not a public self-serve Checkout plan", () => {
    assert.equal(PUBLIC_SELF_SERVE_TIERS.includes("starter"), false);
    assert.equal(PUBLIC_SELF_SERVE_TIERS.includes("enterprise"), false);
    assert.equal(isPublicSelfServeTier("starter"), false);
    assert.equal(isPublicSelfServeTier("pro"), true);
    assert.equal(isPublicSelfServeTier("hive_standard"), true);
    assert.equal(isPublicSelfServeTier("enterprise"), false);
  });
});

describe("stripe-config", () => {
  it("fails closed when secret key is missing", () => {
    const r = stripePaymentsConfigured(readStripeEnv({}));
    assert.equal(r.ok, false);
    assert.match(r.message ?? "", /STRIPE_SECRET_KEY/);
  });

  it("rejects live secret keys", () => {
    assert.equal(isStripeLiveSecretKey("sk_live_abc"), true);
    const r = stripePaymentsConfigured(
      readStripeEnv({
        STRIPE_SECRET_KEY: "sk_live_abc",
      }),
    );
    assert.equal(r.ok, false);
    assert.match(r.message ?? "", /Live Stripe keys are blocked/);
  });

  it("accepts test keys; seat Price IDs default to the Hive sandbox products", () => {
    const env = readStripeEnv({
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    });
    const r = stripePaymentsConfigured(env);
    assert.equal(r.ok, true);
    assert.equal(r.testMode, true);
    assert.equal(isStripeTestPublishableKey(env.publishableKey), true);
    assert.equal(env.priceStaffListMonthly, STRIPE_SANDBOX_PRICE_IDS.seatList);
    assert.equal(env.priceStaffFoundingMonthly, STRIPE_SANDBOX_PRICE_IDS.seatFounding);
  });

  it("maps per-SKU training prices, not a $49 extra", () => {
    const env = readStripeEnv({
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_PRICE_TRAINING_FULL: "price_full",
      STRIPE_PRICE_TRAINING_CPR: "price_cpr",
      STRIPE_PRICE_TRAINING_MANDT: "price_mandt",
      STRIPE_PRICE_TRAINING_DSPD: "price_dspd",
    });
    assert.equal(stripePriceIdForTrainingSku("full_program", null, env), "price_full");
    assert.equal(stripePriceIdForTrainingSku("cpr_first_aid", null, env), "price_cpr");
    assert.equal(stripePriceIdForTrainingSku("mandt", null, env), "price_mandt");
    assert.equal(stripePriceIdForTrainingSku("dspd_required", "price_from_catalog", env), "price_from_catalog");
  });

  it("defaults seat and training Price IDs to the sandbox products (secrets stay empty)", () => {
    const env = readStripeEnv({});
    assert.equal(env.secretKey, null);
    assert.equal(env.publishableKey, null);
    assert.equal(env.webhookSecret, null);
    assert.equal(env.priceStaffListMonthly, "price_1U9EeRIQWMytpLnbNurGi0Vq");
    assert.equal(env.priceStaffFoundingMonthly, "price_1U9EgWIQWMytpLnbyBvs2f4L");
    assert.equal(env.priceTrainingFull, "price_1U9EhyIQWMytpLnbg2nkCFd8");
    assert.equal(env.priceTrainingCpr, "price_1U9EjNIQWMytpLnbPnfRb6Yz");
    assert.equal(env.priceTrainingMandt, "price_1U9EkmIQWMytpLnb2coYT0rn");
    assert.equal(env.priceTrainingDspd, "price_1U9Em5IQWMytpLnb2of9BFOj");
  });

  it("STRIPE_PRICE_SEAT_LIST / STRIPE_PRICE_SEAT_FOUNDING override sandbox defaults", () => {
    const env = readStripeEnv({
      STRIPE_PRICE_SEAT_LIST: "price_custom_list",
      STRIPE_PRICE_SEAT_FOUNDING: "price_custom_founding",
    });
    assert.equal(env.priceStaffListMonthly, "price_custom_list");
    assert.equal(env.priceStaffFoundingMonthly, "price_custom_founding");
  });

  it("list checkout uses the $125 seat price with a 4-seat floor", () => {
    const env = readStripeEnv({});
    const quote = quoteHiveSubscription({
      staffCount: 2,
      clientCount: 5,
      schedule: "list",
      interval: "monthly",
    });
    const pick = stripeSeatPriceForQuote(quote, env);
    assert.equal(pick.priceId, STRIPE_SANDBOX_PRICE_IDS.seatList);
    const items = subscriptionLineItemsForQuote(quote, env);
    assert.equal(items.lineItems.length, 1);
    assert.equal(items.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.seatList);
    assert.equal(items.lineItems[0]?.quantity, 4);
  });

  it("founding checkout uses the $79 seat price and tops up to $299", () => {
    const env = readStripeEnv({});
    const quote = quoteHiveSubscription({
      staffCount: 2,
      clientCount: 5,
      schedule: "founding",
      interval: "monthly",
    });
    const pick = stripeSeatPriceForQuote(quote, env);
    assert.equal(pick.priceId, STRIPE_SANDBOX_PRICE_IDS.seatFounding);
    const items = subscriptionLineItemsForQuote(quote, env);
    assert.equal(items.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.seatFounding);
    assert.equal(items.lineItems[0]?.quantity, 2);
    assert.equal(items.lineItems[1]?.price_data?.unit_amount, 29_900 - 15_800);
  });

  it("webhook/client can be configured without price ids", () => {
    const r = stripeClientConfigured(
      readStripeEnv({
        STRIPE_SECRET_KEY: "sk_test_abc",
      }),
    );
    assert.equal(r.ok, true);
    assert.equal(r.testMode, true);
  });
});
