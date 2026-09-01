import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  openClockableShifts,
  scheduledShiftIsClockedOut,
} from "./caseload-open-work.ts";

const stephenShift = {
  id: "sched-stephen-slh",
  client_id: "client-stephen",
  job_code: "SLH",
  starts_at: "2026-09-01T16:00:00.000Z", // 10:00 AM MT
  ends_at: "2026-09-01T21:00:00.000Z", // 3:00 PM MT
};

const eveningShift = {
  id: "sched-stephen-evening",
  client_id: "client-stephen",
  job_code: "SLH",
  starts_at: "2026-09-02T00:00:00.000Z", // 6:00 PM MT Sep 1
  ends_at: "2026-09-02T03:00:00.000Z",
};

const tomorrowShift = {
  id: "sched-stephen-tomorrow",
  client_id: "client-stephen",
  job_code: "SLH",
  starts_at: "2026-09-02T16:00:00.000Z",
  ends_at: "2026-09-02T21:00:00.000Z",
};

const clockedOut = {
  client_id: "client-stephen",
  service_type_code: "SLH",
  clock_in_timestamp: "2026-09-01T16:00:00.000Z",
  clock_out_timestamp: "2026-09-02T03:15:51.000Z",
  corrected_clock_in: "2026-09-01T16:00:00.000Z",
  corrected_clock_out: "2026-09-01T21:00:00.000Z",
  review_status: "needs_review",
};

describe("scheduledShiftIsClockedOut", () => {
  it("closes Stephen’s morning SLH after he clocks out (uses corrected window)", () => {
    assert.equal(scheduledShiftIsClockedOut(stephenShift, [clockedOut]), true);
  });

  it("does not close a later-today SLH that has no overlapping punch", () => {
    assert.equal(scheduledShiftIsClockedOut(eveningShift, [clockedOut]), false);
  });

  it("does not hide tomorrow’s scheduled SLH", () => {
    assert.equal(scheduledShiftIsClockedOut(tomorrowShift, [clockedOut]), false);
  });

  it("does not match a different client", () => {
    assert.equal(
      scheduledShiftIsClockedOut(
        { ...stephenShift, client_id: "client-tommy" },
        [clockedOut],
      ),
      false,
    );
  });

  it("leaves an open scheduled shift when there is no clock-out", () => {
    assert.equal(scheduledShiftIsClockedOut(stephenShift, []), false);
  });
});

describe("openClockableShifts", () => {
  it("drops the clocked-out Stephen row and keeps tomorrow", () => {
    const open = openClockableShifts(
      [stephenShift, tomorrowShift],
      [clockedOut],
    );
    assert.deepEqual(open.map((s) => s.id), ["sched-stephen-tomorrow"]);
  });
});
