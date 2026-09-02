import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PI_LIST_MINIMUM_DOLLARS, PI_LIST_PER_CLIENT_DOLLARS, PI_TRAINING_ADDONS } from "./pi-landing.ts";
import { TRAINING_PRICE_CENTS } from "./hive-pricing.ts";
import {
  PI_LIST_MINIMUM_CENTS,
  PI_LIST_PER_CLIENT_CENTS,
  SIGNUP_AGENCY_PLACEHOLDER,
  SIGNUP_TRAINING_ADDONS,
  quotePiListSubscription,
  quoteSignupTrainingAddon,
  signupTrainingMatchesPublicCopy,
} from "./pi-signup-pricing.ts";

describe("quotePiListSubscription", () => {
  it("uses locked $69 / client and $350 floor from pi-landing", () => {
    assert.equal(PI_LIST_PER_CLIENT_CENTS, PI_LIST_PER_CLIENT_DOLLARS * 100);
    assert.equal(PI_LIST_MINIMUM_CENTS, PI_LIST_MINIMUM_DOLLARS * 100);
    assert.equal(PI_LIST_PER_CLIENT_CENTS, 6_900);
    assert.equal(PI_LIST_MINIMUM_CENTS, 35_000);
  });

  it("floors 5 clients to $350", () => {
    const q = quotePiListSubscription({ clientCount: 5 });
    assert.equal(q.rawMonthlyCents, 5 * 6_900);
    assert.equal(q.monthlyCents, 35_000);
    assert.equal(q.billedCents, 35_000);
    assert.equal(q.minimumApplied, true);
    assert.equal(q.interval, "monthly");
    assert.match(q.summaryLine, /\$345/);
    assert.match(q.summaryLine, /\$350/);
  });

  it("bills 12 clients at 12 × $69", () => {
    const q = quotePiListSubscription({ clientCount: 12 });
    assert.equal(q.monthlyCents, 12 * 6_900);
    assert.equal(q.minimumApplied, false);
    assert.equal(q.billedCents, 82_800);
    assert.match(q.summaryLine, /\$828/);
  });

  it("does not use founding $79 / $299 or $125 / staff", () => {
    const q = quotePiListSubscription({ clientCount: 2 });
    assert.notEqual(q.monthlyCents, 7_900);
    assert.notEqual(q.monthlyCents, 29_900);
    assert.notEqual(q.monthlyCents, 12_500);
    assert.notEqual(q.monthlyCents, 50_000);
    assert.doesNotMatch(q.label, /founding|\$79|\$299|\$125/i);
    assert.doesNotMatch(q.productName, /staff/i);
  });
});

describe("signup training add-ons", () => {
  it("locks CPR $100, 30-day $75, Mandt $200, pack $300", () => {
    assert.deepEqual(
      SIGNUP_TRAINING_ADDONS.map((row) => `${row.id}:${row.priceCents}`),
      [
        `cpr_first_aid:${TRAINING_PRICE_CENTS.cpr_first_aid}`,
        `thirty_day:${TRAINING_PRICE_CENTS.thirty_day}`,
        `mandt:${TRAINING_PRICE_CENTS.mandt}`,
        `pack:${TRAINING_PRICE_CENTS.full_program}`,
      ],
    );
    assert.equal(TRAINING_PRICE_CENTS.cpr_first_aid, 10_000);
    assert.equal(TRAINING_PRICE_CENTS.thirty_day, 7_500);
    assert.equal(TRAINING_PRICE_CENTS.mandt, 20_000);
    assert.equal(TRAINING_PRICE_CENTS.full_program, 30_000);
    assert.equal(quoteSignupTrainingAddon("pack").priceCents, 30_000);
    assert.equal(quoteSignupTrainingAddon("none").priceCents, 0);
    assert.equal(signupTrainingMatchesPublicCopy(), true);
    assert.deepEqual(
      PI_TRAINING_ADDONS.map((row) => row.price),
      ["$100", "$75", "$200", "$300"],
    );
  });

  it("does not use True North Supports as the agency placeholder", () => {
    assert.equal(SIGNUP_AGENCY_PLACEHOLDER, "Your agency name");
    assert.doesNotMatch(SIGNUP_AGENCY_PLACEHOLDER, /true north/i);
  });
});
