import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANNUAL_DISCOUNT,
  FOUNDING_MINIMUM_CENTS,
  FOUNDING_ORG_CAP,
  FOUNDING_PER_STAFF_CENTS,
  LIST_MINIMUM_CENTS,
  LIST_PER_STAFF_CENTS_1_19,
  LIST_PER_STAFF_CENTS_20_49,
  LIST_PER_STAFF_CENTS_50_PLUS,
  PUBLIC_TRAINING_ALA_CARTE,
  TRAINING_PRICE_CENTS,
  effectivePricingSchedule,
  listPerStaffCents,
  publicTrainingAlaCarteTotalCents,
  publicTrainingBundleSavingsCents,
  quoteHiveSubscription,
  signupScheduleFromPayingCount,
  trainingPriceCentsForSku,
} from "./hive-pricing.ts";

describe("list volume rates", () => {
  it("uses $125 / $109 / $99 by client count", () => {
    assert.equal(listPerStaffCents(1), LIST_PER_STAFF_CENTS_1_19);
    assert.equal(listPerStaffCents(19), LIST_PER_STAFF_CENTS_1_19);
    assert.equal(listPerStaffCents(20), LIST_PER_STAFF_CENTS_20_49);
    assert.equal(listPerStaffCents(49), LIST_PER_STAFF_CENTS_20_49);
    assert.equal(listPerStaffCents(50), LIST_PER_STAFF_CENTS_50_PLUS);
  });
});

describe("quoteHiveSubscription list", () => {
  it("applies the $500 monthly minimum (4 seats at $125)", () => {
    const q = quoteHiveSubscription({
      staffCount: 2,
      clientCount: 5,
      schedule: "list",
      interval: "monthly",
    });
    assert.equal(q.perStaffCents, 12_500);
    assert.equal(q.rawMonthlyCents, 25_000);
    assert.equal(q.monthlyCents, LIST_MINIMUM_CENTS);
    assert.equal(q.minimumApplied, true);
    assert.equal(q.billedCents, LIST_MINIMUM_CENTS);
    const four = quoteHiveSubscription({
      staffCount: 4,
      clientCount: 5,
      schedule: "list",
      interval: "monthly",
    });
    assert.equal(four.monthlyCents, 50_000);
    assert.equal(four.minimumApplied, false);
  });

  it("does not invent a flat $499 / $1,299 plan", () => {
    const q = quoteHiveSubscription({
      staffCount: 8,
      clientCount: 10,
      schedule: "list",
      interval: "monthly",
    });
    assert.equal(q.monthlyCents, 8 * 12_500);
    assert.notEqual(q.monthlyCents, 49_900);
    assert.notEqual(q.monthlyCents, 129_900);
  });

  it("takes 20% off for annual", () => {
    const q = quoteHiveSubscription({
      staffCount: 10,
      clientCount: 10,
      schedule: "list",
      interval: "annual",
    });
    assert.equal(q.monthlyCents, 125_000);
    assert.equal(q.billedCents, Math.round(125_000 * 12 * (1 - ANNUAL_DISCOUNT)));
  });
});

describe("quoteHiveSubscription founding", () => {
  it("uses $79 / staff and $299 minimum", () => {
    const q = quoteHiveSubscription({
      staffCount: 2,
      clientCount: 80,
      schedule: "founding",
      interval: "monthly",
    });
    assert.equal(q.perStaffCents, FOUNDING_PER_STAFF_CENTS);
    assert.equal(q.monthlyCents, FOUNDING_MINIMUM_CENTS);
    assert.equal(q.minimumApplied, true);
  });

  it("steps to list after founding_ends_at", () => {
    const q = quoteHiveSubscription({
      staffCount: 4,
      clientCount: 10,
      schedule: "founding",
      interval: "monthly",
      foundingEndsAt: "2026-01-01T00:00:00.000Z",
      now: new Date("2026-08-28T00:00:00.000Z"),
    });
    assert.equal(q.schedule, "list");
    assert.equal(q.perStaffCents, LIST_PER_STAFF_CENTS_1_19);
  });
});

describe("founding slots", () => {
  it("signup uses founding until 5 paying orgs exist", () => {
    assert.equal(signupScheduleFromPayingCount(0), "founding");
    assert.equal(signupScheduleFromPayingCount(4), "founding");
    assert.equal(signupScheduleFromPayingCount(FOUNDING_ORG_CAP), "list");
  });

  it("expired founding is list", () => {
    assert.equal(
      effectivePricingSchedule({
        schedule: "founding",
        foundingEndsAt: "2020-01-01T00:00:00.000Z",
        now: new Date("2026-08-28T00:00:00.000Z"),
      }),
      "list",
    );
  });
});

describe("training catalog amounts", () => {
  it("locks CPR $100, 30-day $75, Mandt $200, package $300", () => {
    assert.equal(TRAINING_PRICE_CENTS.full_program, 30_000);
    assert.equal(TRAINING_PRICE_CENTS.cpr_first_aid, 10_000);
    assert.equal(TRAINING_PRICE_CENTS.mandt, 20_000);
    assert.equal(TRAINING_PRICE_CENTS.thirty_day, 7_500);
    assert.equal(TRAINING_PRICE_CENTS.dspd_required, 7_500);
    assert.equal(trainingPriceCentsForSku("mandt"), 20_000);
    assert.equal(trainingPriceCentsForSku("thirty_day"), 7_500);
    assert.equal(trainingPriceCentsForSku("dspd_required"), 7_500);
    assert.notEqual(trainingPriceCentsForSku("cpr_first_aid"), 4_900);
    assert.notEqual(trainingPriceCentsForSku("cpr_first_aid"), 7_500);
  });

  it("public catalog matches locked prices and $75 package savings", () => {
    assert.equal(PUBLIC_TRAINING_ALA_CARTE.length, 3);
    assert.equal(
      PUBLIC_TRAINING_ALA_CARTE.map((c) => `${c.name}:${c.priceCents / 100}`).join("|"),
      "CPR / First Aid:100|Mandt:200|30-day orientation:75",
    );
    assert.equal(publicTrainingAlaCarteTotalCents(), 37_500);
    assert.equal(TRAINING_PRICE_CENTS.full_program, 30_000);
    assert.equal(publicTrainingBundleSavingsCents(), 7_500);
    assert.ok(PUBLIC_TRAINING_ALA_CARTE.every((c) => c.priceCents > 0));
  });
});
