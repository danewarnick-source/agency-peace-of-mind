import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toIsoDateDay } from "./iso-date-day.ts";

describe("toIsoDateDay", () => {
  it("returns YYYY-MM-DD from an ISO string without calling Date", () => {
    assert.equal(toIsoDateDay("2026-07-01T00:00:00.000Z"), "2026-07-01");
    assert.equal(toIsoDateDay("2026-07-01"), "2026-07-01");
  });

  it("coerces a Date (node-pg) before slice", () => {
    const d = new Date("2026-07-01T15:30:00.000Z");
    assert.equal(toIsoDateDay(d), "2026-07-01");
  });

  it("coerces a Date-like object that is not a string", () => {
    const raw = { toISOString: () => "2026-08-15T12:00:00.000Z" };
    assert.equal(toIsoDateDay(raw), "2026-08-15");
  });

  it("never throws for random objects (the live RDS hang)", () => {
    assert.equal(toIsoDateDay({ foo: 1 }), null);
    assert.equal(toIsoDateDay(Object.create(null)), null);
  });

  it("does not throw when slice is missing", () => {
    assert.equal(toIsoDateDay({}), null);
    assert.equal(toIsoDateDay(null), null);
    assert.equal(toIsoDateDay(undefined), null);
  });
});
