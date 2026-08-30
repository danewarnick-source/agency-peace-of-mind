import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarMonths,
  daysInCalendarMonth,
  denverYmd,
  denverYmdFromInstant,
  parseYmd,
  weekdaySunday0,
  ymdFromParts,
} from "./denver-date.ts";

describe("denver-date", () => {
  it("formats a known Mountain instant as the Denver calendar day", () => {
    // 2026-08-30 23:30 MDT = 2026-08-31 05:30 UTC
    assert.equal(denverYmd(new Date("2026-08-31T05:30:00.000Z")), "2026-08-30");
    assert.equal(denverYmdFromInstant("2026-08-31T05:30:00.000Z"), "2026-08-30");
  });

  it("parses and rebuilds YMD parts", () => {
    assert.deepEqual(parseYmd("2026-08-30"), { year: 2026, month: 8, day: 30 });
    assert.equal(ymdFromParts(2026, 8, 3), "2026-08-03");
    assert.equal(daysInCalendarMonth(2026, 8), 31);
    assert.equal(weekdaySunday0("2026-08-30"), 0);
  });

  it("walks calendar months", () => {
    assert.deepEqual(addCalendarMonths(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(addCalendarMonths(2026, 1, -1), { year: 2025, month: 12 });
  });
});
