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
  readStripeEnv,
} from "./stripe-config.ts";

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

  it("accepts test keys without price ids (price_data fallback)", () => {
    const env = readStripeEnv({
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
    });
    const r = stripePaymentsConfigured(env);
    assert.equal(r.ok, true);
    assert.equal(r.testMode, true);
    assert.equal(isStripeTestPublishableKey(env.publishableKey), true);
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
