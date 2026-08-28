import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationMs,
  formatPunchDateSpan,
  formatPunchRange,
  isLongOpenPunch,
  recordDurationMin,
  staffDisplayName,
} from "./record-duration.ts";

describe("live 30e77b63 Tommy Jones DSI — do not manufacture 3h45m", () => {
  // Hive-Platform: clock_in 2026-08-17 02:56:07 UTC (Denver evening Aug 16)
  // clock_out 2026-08-27 06:41:02 UTC. EXTRACT epoch = 243.75h.
  const punchIn = "2026-08-17T02:56:07.000Z";
  const punchOut = "2026-08-27T06:41:02.000Z";
  const tz = "America/Denver";

  it("epoch span is 243.75h / 243h 45m", () => {
    const hours = durationMs(punchIn, punchOut) / 3_600_000;
    assert.ok(Math.abs(hours - 243.75) < 0.01);
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

  it("shows Aug 16 and Aug 27 in America/Denver — not a same-evening 4h shift", () => {
    const range = formatPunchRange(punchIn, punchOut, tz);
    assert.match(range, /Aug 16/);
    assert.match(range, /Aug 27/);
    const span = formatPunchDateSpan(punchIn, punchOut, tz);
    assert.match(span, /Aug 16/);
    assert.match(span, /Aug 27/);
  });

  it("flags a 10-day open punch without editing timestamps", () => {
    const min = recordDurationMin({
      clock_in_timestamp: punchIn,
      clock_out_timestamp: punchOut,
    });
    assert.equal(isLongOpenPunch(min), true);
    assert.equal(isLongOpenPunch(3 * 60 + 45), false);
  });
});

describe("same-evening and overnight punches", () => {
  it("same local evening is 3h 45m and does not print dates", () => {
    const punchIn = "2026-08-16T19:56:00-06:00";
    const punchOut = "2026-08-16T23:41:00-06:00";
    assert.equal(
      recordDurationMin({
        clock_in_timestamp: punchIn,
        clock_out_timestamp: punchOut,
      }),
      225,
    );
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
  it("never returns a truncated user id (0a6df668)", () => {
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
    assert.equal(
      staffDisplayName(null, "0a6df668-a1a4-4cad-86f2-815ba4d9e1c0"),
      "Staff",
    );
    assert.equal(staffDisplayName({ full_name: "0a6df668" }), "Staff");
  });
});
