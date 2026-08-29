import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEntryUnits,
  effectiveBillingTimes,
  remainingUnitsForCode,
  rollupClientUsage,
} from "./billing-units.ts";

describe("remainingUnitsForCode", () => {
  it("clamps over-cap to 0 remaining", () => {
    assert.equal(remainingUnitsForCode(500, 1461), 0);
  });

  it("returns unused units when under cap", () => {
    assert.equal(remainingUnitsForCode(365, 0), 365);
    assert.equal(remainingUnitsForCode(500, 34), 466);
  });
});

describe("rollupClientUsage — overview and detail share this remaining math", () => {
  it("sums per-code remaining instead of remaining(sum) so one over-cap code cannot hide another", () => {
    // Jones-style: DSI 1461 used of 500 (over) + HHS 0 used of 365
    const rolled = rollupClientUsage([
      { annual: 500, used: 1461 },
      { annual: 365, used: 0 },
    ]);
    assert.equal(rolled.totalAnnual, 865);
    assert.equal(rolled.totalUsed, 1461);
    assert.equal(rolled.remaining, 365);
    assert.ok(rolled.pct > 100);
  });

  it("does not report leftover remaining when every code is exhausted", () => {
    const rolled = rollupClientUsage([
      { annual: 500, used: 1461 },
      { annual: 365, used: 365 },
    ]);
    assert.equal(rolled.remaining, 0);
  });
});

describe("effectiveBillingTimes — rounded punch counts when raw out is missing", () => {
  it("uses rounded in/out so a live 243h punch is not dropped", () => {
    const t = effectiveBillingTimes({
      clock_in_timestamp: "2026-08-16T18:00:00-06:00",
      clock_out_timestamp: null,
      rounded_clock_in: "2026-08-16T18:00:00-06:00",
      rounded_clock_out: "2026-08-27T01:45:00-06:00",
      review_status: "clean",
    });
    assert.ok(t);
    const units = computeEntryUnits(t!.in, t!.out);
    assert.ok(units > 900, `expected a multi-day unit count, got ${units}`);
  });

  it("returns null when review is pending", () => {
    assert.equal(
      effectiveBillingTimes({
        clock_in_timestamp: "2026-08-16T18:00:00Z",
        clock_out_timestamp: "2026-08-16T20:00:00Z",
        review_status: "needs_review",
      }),
      null,
    );
  });
});
