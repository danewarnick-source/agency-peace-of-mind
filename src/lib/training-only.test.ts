import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { TRAINING_PRICE_CENTS } from "./hive-pricing.ts";
import { STRIPE_SANDBOX_PRICE_IDS, readStripeEnv } from "./stripe-config.ts";
import {
  cleanTrainingOnlyPeople,
  quoteTrainingOnlyPeople,
  trainingOnlyIncludesClassSeat,
  trainingOnlyIncludesThirtyDay,
  trainingOnlyLineItems,
  trainingOnlyPackCovers,
  trainingOnlySkuLabel,
  validateTrainingOnlyBuyer,
  validateTrainingOnlyPeople,
} from "./training-only.ts";

describe("training-only roster", () => {
  it("quotes 1 CPR, 3 pack, 1 thirty-day at locked cents", () => {
    const quote = quoteTrainingOnlyPeople([
      { name: "Ada", sku: "cpr_first_aid" },
      { name: "Bea", sku: "pack" },
      { name: "Cal", sku: "pack" },
      { name: "Dee", sku: "pack" },
      { name: "Eve", sku: "thirty_day" },
    ]);
    assert.equal(quote.people, 5);
    assert.equal(quote.totalCents, 10_000 + 30_000 * 3 + 7_500);
    assert.deepEqual(
      quote.lines.map((line) => `${line.sku}:${line.quantity}:${line.lineCents}`),
      ["cpr_first_aid:1:10000", "thirty_day:1:7500", "pack:3:90000"],
    );
  });

  it("quantities are people on each SKU", () => {
    const quote = quoteTrainingOnlyPeople([
      { name: "Ada", sku: "mandt" },
      { name: "Bea", sku: "mandt" },
    ]);
    assert.equal(quote.lines[0]?.quantity, 2);
    assert.equal(quote.lines[0]?.unitCents, TRAINING_PRICE_CENTS.mandt);
  });

  it("rejects empty names and mixed SKUs for the same person", () => {
    assert.match(validateTrainingOnlyPeople([]), /at least one/i);
    assert.match(
      validateTrainingOnlyPeople([{ name: "A", sku: "cpr_first_aid" }]),
      /name/i,
    );
    assert.match(
      validateTrainingOnlyPeople([
        { name: "Ada", sku: "cpr_first_aid" },
        { name: "Ada", sku: "pack" },
      ]),
      /one option/i,
    );
    assert.match(
      validateTrainingOnlyPeople([
        { name: "Ada", sku: "pack" },
        { name: "Ada", sku: "pack" },
      ]),
      /twice/i,
    );
    assert.equal(
      validateTrainingOnlyPeople([
        { name: "Ada", sku: "cpr_first_aid" },
        { name: "Bea", sku: "pack" },
      ]),
      null,
    );
  });

  it("trims blank rows and keeps locked labels", () => {
    const cleaned = cleanTrainingOnlyPeople([
      { name: "  Ada  ", sku: "pack" },
      { name: "   ", sku: "mandt" },
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(trainingOnlySkuLabel("pack"), "Pack");
    assert.equal(trainingOnlyIncludesThirtyDay("pack"), true);
    assert.equal(trainingOnlyIncludesClassSeat("thirty_day"), false);
    assert.deepEqual(trainingOnlyPackCovers(), ["cpr_first_aid", "thirty_day", "mandt"]);
  });

  it("requires receipt email and I-agree; agency name is optional", () => {
    assert.match(
      validateTrainingOnlyBuyer({ email: "not-email", termsAccepted: true }),
      /email/i,
    );
    assert.match(
      validateTrainingOnlyBuyer({ email: "ada@hive.test", termsAccepted: false }),
      /terms/i,
    );
    assert.equal(
      validateTrainingOnlyBuyer({
        email: "Ada@Hive.Test",
        agencyName: "Outside Agency",
        termsAccepted: true,
      }),
      null,
    );
    assert.equal(
      validateTrainingOnlyBuyer({ email: "ada@hive.test", termsAccepted: true }),
      null,
    );
  });
});

describe("training-only Stripe lines", () => {
  it("uses the existing TEST catalog Price IDs and never a subscription", () => {
    const env = readStripeEnv({});
    const items = trainingOnlyLineItems(
      [
        { name: "Ada", sku: "cpr_first_aid" },
        { name: "Bea", sku: "pack" },
        { name: "Cal", sku: "pack" },
        { name: "Dee", sku: "thirty_day" },
        { name: "Eve", sku: "mandt" },
      ],
      env,
    );
    assert.deepEqual(
      items.map((row) => `${row.price}:${row.quantity}`),
      [
        `${STRIPE_SANDBOX_PRICE_IDS.trainingCpr}:1`,
        `${STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay}:1`,
        `${STRIPE_SANDBOX_PRICE_IDS.trainingMandt}:1`,
        `${STRIPE_SANDBOX_PRICE_IDS.trainingPack}:2`,
      ],
    );
    assert.equal(
      items.some((row) => row.price === STRIPE_SANDBOX_PRICE_IDS.piListPerClient),
      false,
    );
    assert.equal(
      items.some((row) => row.price === STRIPE_SANDBOX_PRICE_IDS.piListMinimum),
      false,
    );
    assert.equal(
      items.some((row) => row.price_data?.recurring),
      false,
    );
  });
});

describe("training-only public copy", () => {
  it("does not name Hive Certify or DSPD on the public purchase page", () => {
    const page = readFileSync(new URL("../routes/training.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /Hive Certify/);
    assert.doesNotMatch(page, /DSPD/);
    assert.doesNotMatch(page, /\$69|\$350/);
    assert.match(page, /Just need training|Buy classes|Training/);
  });
});
