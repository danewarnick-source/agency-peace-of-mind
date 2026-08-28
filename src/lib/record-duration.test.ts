import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationMs,
  formatPunchDateSpan,
  formatPunchRange,
  recordDurationMin,
  staffDisplayName,
} from "./record-duration.ts";

describe("record duration — live 30e77b63 (Aug 16 evening Denver → Aug 27)", () => {
  // 243.75h = 243h 45m = 10d + 3h 45m. clock_out is Aug 27 UTC / Aug 26 11:41 PM Denver.
  const punchIn = "2026-08-16T19:56:00-06:00";
  const punchOut = "2026-08-27T05:41:00.000Z";

  it("keeps 243h 45m and does not collapse to a same-evening 3h 45m", () => {
    assert.equal(Math.round(durationMs(punchIn, punchOut) / 60_000), 243 * 60 + 45);
    assert.equal(
      recordDurationMin({
        clock_in_timestamp: punchIn,
        clock_out_timestamp: punchOut,
      }),
      243 * 60 + 45,
    );
    assert.equal(((243 * 60 + 45) / 60).toFixed(1), "243.8");
  });

  it("does not ignore clock_out when rounded_out is the same evening", () => {
    assert.equal(
      recordDurationMin({
        clock_in_timestamp: punchIn,
        clock_out_timestamp: punchOut,
        rounded_clock_in: "2026-08-16T20:00:00-06:00",
        rounded_clock_out: "2026-08-16T23:45:00-06:00",
      }),
      243 * 60 + 45,
    );
  });

  it("shows both calendar dates in America/Denver", () => {
    const tz = "America/Denver";
    assert.match(formatPunchRange(punchIn, punchOut, tz), /Aug 16/);
    assert.match(formatPunchRange(punchIn, punchOut, tz), /Aug 26/);
    assert.match(formatPunchDateSpan(punchIn, punchOut, tz), /Aug 16/);
    assert.match(formatPunchDateSpan(punchIn, punchOut, tz), /Aug 26/);
  });
});

describe("same-evening and overnight punches", () => {
  it("same local evening is 3h 45m", () => {
    const punchIn = "2026-08-16T19:56:00-06:00";
    const punchOut = "2026-08-16T23:41:00-06:00";
    assert.equal(recordDurationMin({
      clock_in_timestamp: punchIn,
      clock_out_timestamp: punchOut,
    }), 225);
    const range = formatPunchRange(punchIn, punchOut, "America/Denver");
    assert.equal(range.includes("Aug"), false);
    assert.match(range, /PM →/);
  });

  it("wraps overnight when out is earlier than in by less than 24h", () => {
    const inTs = "2026-08-16T22:00:00-06:00";
    const outTs = "2026-08-16T02:00:00-06:00";
    assert.equal(Math.round(durationMs(inTs, outTs) / 60_000), 4 * 60);
  });
});

describe("staffDisplayName", () => {
  it("never returns a truncated user id", () => {
    assert.equal(
      staffDisplayName({ full_name: "Dane Warnick" }),
      "Dane Warnick",
    );
    assert.equal(
      staffDisplayName({ first_name: "Dane", last_name: "Warnick", full_name: null }),
      "Dane Warnick",
    );
    assert.equal(staffDisplayName(null), "Staff");
    assert.equal(staffDisplayName({ full_name: "  " }), "Staff");
  });
});
