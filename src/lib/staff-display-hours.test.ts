import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  staffDisplayHours,
  staffDisplayPunchPair,
  staffTimesheetStatus,
} from "./staff-display-hours.ts";

const RAW_IN = "2026-08-31T16:00:00.000Z";
const RAW_OUT = "2026-09-01T03:15:51.000Z"; // ~11h 15m
const CORR_IN = "2026-08-31T16:00:00.000Z";
const CORR_OUT = "2026-08-31T21:00:00.000Z"; // 5h

const edited = {
  clock_in_timestamp: RAW_IN,
  clock_out_timestamp: RAW_OUT,
  corrected_clock_in: CORR_IN,
  corrected_clock_out: CORR_OUT,
};

describe("staffDisplayHours — corrected span wins while pending review", () => {
  it("uses the edited 5h pair when review_status is needs_review", () => {
    const hrs = staffDisplayHours({ ...edited, review_status: "needs_review" });
    assert.ok(Math.abs(hrs - 5) < 0.01, `expected ~5h, got ${hrs}`);
  });

  it("uses the edited pair when approved", () => {
    const hrs = staffDisplayHours({ ...edited, review_status: "approved" });
    assert.ok(Math.abs(hrs - 5) < 0.01);
  });

  it("falls back to the raw 11h span when the supervisor denies the edit", () => {
    const hrs = staffDisplayHours({ ...edited, review_status: "rejected" });
    assert.ok(Math.abs(hrs - 11.264) < 0.02, `expected ~11.26h, got ${hrs}`);
    const pair = staffDisplayPunchPair({ ...edited, review_status: "rejected" });
    assert.equal(pair.in, RAW_IN);
    assert.equal(pair.out, RAW_OUT);
  });

  it("uses raw times when there is no correction", () => {
    const hrs = staffDisplayHours({
      clock_in_timestamp: RAW_IN,
      clock_out_timestamp: RAW_OUT,
      review_status: "clean",
    });
    assert.ok(Math.abs(hrs - 11.264) < 0.02);
  });
});

describe("staffTimesheetStatus", () => {
  it("labels a pending time-clock adjustment", () => {
    assert.equal(
      staffTimesheetStatus({
        clock_out_timestamp: RAW_OUT,
        review_status: "needs_review",
      }),
      "Awaiting supervisor approval",
    );
  });

  it("labels a submitted punch with no review flag", () => {
    assert.equal(
      staffTimesheetStatus({
        clock_out_timestamp: RAW_OUT,
        review_status: "clean",
      }),
      "Submitted",
    );
  });
});
