import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationMs,
  recordDurationMin,
  staffDisplayName,
} from "./record-duration.ts";

describe("record duration — Tommy Jones DSI Aug 16 7:56 PM → 11:41 PM", () => {
  // 3h 45m = 225 minutes. 243h 45m = 10 calendar days + 3h 45m.
  const punchIn = "2026-08-16T19:56:00-06:00";
  const punchOut = "2026-08-16T23:41:00-06:00";

  it("same-evening punch is 3h 45m, not 243h 45m", () => {
    const ms = durationMs(punchIn, punchOut);
    assert.equal(Math.round(ms / 60_000), 225);
    assert.equal(
      recordDurationMin({
        clock_in_timestamp: punchIn,
        clock_out_timestamp: punchOut,
      }),
      225,
    );
  });

  it("does not add 10 extra days when rounded_out has a later date", () => {
    const roundedOutTenDaysLater = "2026-08-26T23:45:00-06:00";
    assert.equal(
      recordDurationMin({
        clock_in_timestamp: punchIn,
        clock_out_timestamp: punchOut,
        rounded_clock_in: "2026-08-16T20:00:00-06:00",
        rounded_clock_out: roundedOutTenDaysLater,
      }),
      225,
    );
  });

  it("wraps overnight when out is earlier than in", () => {
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
