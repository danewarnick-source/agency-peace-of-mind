import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBillingExempt,
  orgAccessIsLocked,
  orgLooksLikeTrueNorth,
  parseCheckoutReturnSearch,
  pathBypassesBillingLock,
  shouldLeaveBillingLockScreen,
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
  subscriptionLineItemsForPiListQuote,
  monthlyCentsFromPiListLineItems,
  readStripeEnv,
  resolveAgencyCheckoutPricingModel,
  STRIPE_SANDBOX_PRICE_IDS,
} from "./stripe-config.ts";
import { quoteHiveSubscription } from "./hive-pricing.ts";
import { quotePiListSubscription, quoteSignupTrainingAddon } from "./pi-signup-pricing.ts";

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

  it("TNS org id and TNS acronym are exempt without the flag or name", () => {
    assert.equal(
      isBillingExempt({
        billingExempt: false,
        orgName: "Workspace",
        organizationId: "7fabcf5d-f826-487f-8730-8b0c3f1969bb",
      }),
      true,
    );
    assert.equal(
      isBillingExempt({
        billingExempt: false,
        orgName: "Workspace",
        displayAcronym: "TNS",
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

  it("Postgres-active paid row leaves the lock screen; missing row stays locked", () => {
    const paid = {
      billingExempt: false,
      orgName: "Paying Agency",
      organizationId: "0e590b2c-7843-4a83-a8f3-8c7189497879",
      subscription: {
        status: "active",
        locked_at: null,
        stripe_subscription_id: "sub_1UBiQzIQWMytpLnbTbuycIJk",
      },
    };
    assert.equal(orgAccessIsLocked(paid), false);
    assert.equal(shouldLeaveBillingLockScreen(paid), true);
    const unpaid = {
      billingExempt: false,
      orgName: "Test Agency 1",
      subscription: null,
    };
    assert.equal(orgAccessIsLocked(unpaid), true);
    assert.equal(shouldLeaveBillingLockScreen(unpaid), false);
  });

  it("lets admins open the subscription page while locked", () => {
    assert.equal(pathBypassesBillingLock("/dashboard/billing/subscription", true), true);
    assert.equal(pathBypassesBillingLock("/dashboard/billing/subscription", false), false);
    assert.equal(pathBypassesBillingLock("/dashboard", true), false);
  });

  it("keeps Stripe checkout return params so confirm can re-query", () => {
    assert.deepEqual(
      parseCheckoutReturnSearch("?checkout=success&session_id=cs_test_abc"),
      { checkout: "success", session_id: "cs_test_abc" },
    );
    assert.deepEqual(parseCheckoutReturnSearch({ focus: "x" }), {});
    assert.equal(parseCheckoutReturnSearch({ session_id: "not-a-session" }).session_id, undefined);
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
    assert.match(r.message ?? "", /TEST MODE only/);
    assert.match(r.message ?? "", /preview URL/);
  });

  it("agency Checkout defaults to PI list, not leftover hive_staff seats", () => {
    assert.equal(resolveAgencyCheckoutPricingModel(undefined), "pi_list");
    assert.equal(resolveAgencyCheckoutPricingModel("pi_list"), "pi_list");
    assert.equal(resolveAgencyCheckoutPricingModel("hive_staff"), "hive_staff");
  });

  it("signup list checkout uses PI catalog prices: $69 × clients XOR $350 floor, not $125 seats", () => {
    const env = readStripeEnv({});
    const five = quotePiListSubscription({ clientCount: 5 });
    const fiveItems = subscriptionLineItemsForPiListQuote(five, quoteSignupTrainingAddon("pack"), env);
    assert.equal(five.minimumApplied, true);
    assert.equal(fiveItems.lineItems.length, 2);
    assert.equal(fiveItems.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.piListMinimum);
    assert.equal(fiveItems.lineItems[0]?.quantity, 1);
    assert.equal(fiveItems.lineItems[1]?.price, STRIPE_SANDBOX_PRICE_IDS.trainingPack);
    assert.equal(
      fiveItems.lineItems.some((row) => row.price === STRIPE_SANDBOX_PRICE_IDS.piListPerClient),
      false,
      "floor must not also charge $69 × clients",
    );
    assert.equal(monthlyCentsFromPiListLineItems(fiveItems.lineItems, env), 35_000);
    assert.notEqual(fiveItems.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.seatList);
    assert.notEqual(fiveItems.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.seatFounding);

    const twelve = subscriptionLineItemsForPiListQuote(quotePiListSubscription({ clientCount: 12 }), null, env);
    assert.equal(twelve.lineItems.length, 1);
    assert.equal(twelve.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.piListPerClient);
    assert.equal(twelve.lineItems[0]?.quantity, 12);
    assert.equal(
      twelve.lineItems.some((row) => row.price === STRIPE_SANDBOX_PRICE_IDS.piListMinimum),
      false,
      "at-or-above floor must not also charge the $350 price",
    );
    assert.equal(monthlyCentsFromPiListLineItems(twelve.lineItems, env), 82_800);

    const six = subscriptionLineItemsForPiListQuote(quotePiListSubscription({ clientCount: 6 }), null, env);
    assert.equal(six.lineItems[0]?.price, STRIPE_SANDBOX_PRICE_IDS.piListPerClient);
    assert.equal(six.lineItems[0]?.quantity, 6);
    assert.equal(monthlyCentsFromPiListLineItems(six.lineItems, env), 41_400);
  });

  it("signup training add-ons use the matching TEST catalog Price IDs", () => {
    const env = readStripeEnv({});
    const quote = quotePiListSubscription({ clientCount: 12 });
    assert.equal(
      subscriptionLineItemsForPiListQuote(quote, quoteSignupTrainingAddon("cpr_first_aid"), env).lineItems[1]?.price,
      STRIPE_SANDBOX_PRICE_IDS.trainingCpr,
    );
    assert.equal(
      subscriptionLineItemsForPiListQuote(quote, quoteSignupTrainingAddon("thirty_day"), env).lineItems[1]?.price,
      STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay,
    );
    assert.equal(
      subscriptionLineItemsForPiListQuote(quote, quoteSignupTrainingAddon("mandt"), env).lineItems[1]?.price,
      STRIPE_SANDBOX_PRICE_IDS.trainingMandt,
    );
    assert.equal(
      subscriptionLineItemsForPiListQuote(quote, quoteSignupTrainingAddon("pack"), env).lineItems[1]?.price,
      STRIPE_SANDBOX_PRICE_IDS.trainingPack,
    );
    const roster = subscriptionLineItemsForPiListQuote(
      quote,
      [
        { id: "cpr_first_aid", name: "CPR / First Aid", priceCents: 10_000, quantity: 1 },
        { id: "thirty_day", name: "30-day", priceCents: 7_500, quantity: 1 },
        { id: "pack", name: "Pack", priceCents: 30_000, quantity: 3 },
      ],
      env,
    );
    assert.equal(roster.lineItems[1]?.price, STRIPE_SANDBOX_PRICE_IDS.trainingCpr);
    assert.equal(roster.lineItems[1]?.quantity, 1);
    assert.equal(roster.lineItems[2]?.price, STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay);
    assert.equal(roster.lineItems[2]?.quantity, 1);
    assert.equal(roster.lineItems[3]?.price, STRIPE_SANDBOX_PRICE_IDS.trainingPack);
    assert.equal(roster.lineItems[3]?.quantity, 3);
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
    assert.equal(env.pricePiListPerClient, STRIPE_SANDBOX_PRICE_IDS.piListPerClient);
    assert.equal(env.pricePiListMinimum, STRIPE_SANDBOX_PRICE_IDS.piListMinimum);
    assert.equal(env.priceTrainingCpr, STRIPE_SANDBOX_PRICE_IDS.trainingCpr);
    assert.equal(env.priceTrainingMandt, STRIPE_SANDBOX_PRICE_IDS.trainingMandt);
    assert.equal(env.priceTrainingThirtyDay, STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay);
    assert.equal(env.priceTrainingPack, STRIPE_SANDBOX_PRICE_IDS.trainingPack);
    assert.equal(env.priceTrainingDspd, STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay);
  });

  it("STRIPE_PRICE_PI_LIST_* and training env vars override PI catalog defaults", () => {
    const env = readStripeEnv({
      STRIPE_PRICE_PI_LIST_PER_CLIENT: "price_custom_client",
      STRIPE_PRICE_PI_LIST_MINIMUM: "price_custom_min",
      STRIPE_PRICE_TRAINING_PACK: "price_custom_pack",
    });
    assert.equal(env.pricePiListPerClient, "price_custom_client");
    assert.equal(env.pricePiListMinimum, "price_custom_min");
    assert.equal(env.priceTrainingPack, "price_custom_pack");
    const items = subscriptionLineItemsForPiListQuote(
      quotePiListSubscription({ clientCount: 12 }),
      quoteSignupTrainingAddon("pack"),
      env,
    );
    assert.equal(items.lineItems[0]?.price, "price_custom_client");
    assert.equal(items.lineItems[1]?.price, "price_custom_pack");
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
