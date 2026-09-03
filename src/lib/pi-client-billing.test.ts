import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ANNUAL_DISCOUNT } from "./hive-pricing.ts";
import {
  annualCancelRefundCents,
  calendarMonthPeriod,
  clientIsBillableInPeriod,
  countBillableClients,
  dropRenewalCredit,
  leftoverAddInvoice,
  leftoverMonths,
  monthlyCentsForClientCount,
  prepaidYearKeepsAccess,
  yearlyDiscountForInterval,
} from "./pi-client-billing.ts";

const jan = { start: "2026-01-01", end: "2026-02-01" };
const feb = { start: "2026-02-01", end: "2026-03-01" };

describe("high-water client count", () => {
  it("uses created_at and discharge_date only", () => {
    assert.equal(
      clientIsBillableInPeriod({ created_at: "2026-01-10T18:00:00.000Z", discharge_date: null }, jan),
      true,
    );
    assert.equal(
      clientIsBillableInPeriod({ created_at: "2026-02-01T12:00:00.000Z", discharge_date: null }, jan),
      false,
    );
    assert.equal(
      clientIsBillableInPeriod({ created_at: "2025-06-01T00:00:00.000Z", discharge_date: "2025-12-31" }, jan),
      false,
    );
  });

  it("counts a discharge on the 30th for that month, not the next", () => {
    const row = { created_at: "2025-03-01T00:00:00.000Z", discharge_date: "2026-01-30" };
    assert.equal(clientIsBillableInPeriod(row, jan), true);
    assert.equal(clientIsBillableInPeriod(row, feb), false);
  });

  it("counts deactivate-on-the-30th then restore-on-the-2nd for both months after restore", () => {
    const stillOut = { created_at: "2025-03-01T00:00:00.000Z", discharge_date: "2026-01-30" };
    assert.equal(clientIsBillableInPeriod(stillOut, jan), true);
    const restored = { created_at: "2025-03-01T00:00:00.000Z", discharge_date: null };
    assert.equal(clientIsBillableInPeriod(restored, jan), true);
    assert.equal(clientIsBillableInPeriod(restored, feb), true);
  });

  it("does not invent discharged_at or inactive", () => {
    const src = readFileSync(new URL("./pi-client-billing.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /row\.discharged_at|discharged_at:/);
    assert.doesNotMatch(src, /account_status\s*===|["']inactive["']/);
  });

  it("sums high-water for the period", () => {
    const rows = [
      { created_at: "2025-01-01T00:00:00.000Z", discharge_date: null },
      { created_at: "2026-01-15T00:00:00.000Z", discharge_date: null },
      { created_at: "2025-01-01T00:00:00.000Z", discharge_date: "2025-12-20" },
      { created_at: "2026-02-10T00:00:00.000Z", discharge_date: null },
    ];
    assert.equal(countBillableClients(rows, jan), 2);
    assert.equal(countBillableClients(rows, feb), 3);
  });
});

describe("calendar month period", () => {
  it("uses the first of the next month as exclusive end", () => {
    const p = calendarMonthPeriod(new Date("2026-09-03T12:00:00-06:00"));
    assert.equal(p.start, "2026-09-01");
    assert.equal(p.end, "2026-10-01");
  });
});

describe("leftover-month adds and drop credits", () => {
  it("invoices leftover months for extra clients at the yearly discount", () => {
    const add = leftoverAddInvoice({
      previousCount: 6,
      nextCount: 8,
      leftoverMonths: 8,
      yearlyDiscount: ANNUAL_DISCOUNT,
    });
    assert.equal(add.addedClients, 2);
    assert.equal(add.monthlyDeltaCents, 2 * 6_900);
    assert.equal(add.invoiceCents, Math.round(2 * 6_900 * 8 * 0.8));
    assert.equal(add.invoiceCents, 88_320);
  });

  it("does not invoice when still under the $350 floor", () => {
    const add = leftoverAddInvoice({
      previousCount: 3,
      nextCount: 4,
      leftoverMonths: 6,
      yearlyDiscount: 0,
    });
    assert.equal(monthlyCentsForClientCount(3), 35_000);
    assert.equal(monthlyCentsForClientCount(4), 35_000);
    assert.equal(add.invoiceCents, 0);
  });

  it("credits drops at renewal with no cash refund", () => {
    const drop = dropRenewalCredit({
      previousCount: 8,
      nextCount: 6,
      leftoverMonths: 8,
      yearlyDiscount: ANNUAL_DISCOUNT,
    });
    assert.equal(drop.droppedClients, 2);
    assert.equal(drop.cashRefundCents, 0);
    assert.equal(drop.creditCents, Math.round(2 * 6_900 * 8 * 0.8));
  });

  it("annual cancel has no cash refund and keeps the prepaid year", () => {
    assert.equal(annualCancelRefundCents(), 0);
    assert.equal(
      prepaidYearKeepsAccess({
        interval: "annual",
        periodEndIso: "2027-01-01T00:00:00.000Z",
        now: new Date("2026-09-03T00:00:00.000Z"),
      }),
      true,
    );
    assert.equal(
      prepaidYearKeepsAccess({
        interval: "annual",
        periodEndIso: "2026-01-01T00:00:00.000Z",
        now: new Date("2026-09-03T00:00:00.000Z"),
      }),
      false,
    );
    assert.equal(
      prepaidYearKeepsAccess({
        interval: "monthly",
        periodEndIso: "2026-10-01T00:00:00.000Z",
        now: new Date("2026-09-03T00:00:00.000Z"),
      }),
      false,
    );
  });

  it("counts leftover months through a Stripe period-end boundary", () => {
    const n = leftoverMonths(new Date("2026-05-15T12:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"));
    assert.equal(n, 8);
  });

  it("applies the locked yearly discount only on annual", () => {
    assert.equal(yearlyDiscountForInterval("annual"), 0.2);
    assert.equal(yearlyDiscountForInterval("monthly"), 0);
  });
});
