import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { denverYmd, denverWallToIso } from "../denver-date.ts";
import {
  addDaysYmd,
  denverHourMinute,
  denverWeekUtcBounds,
  expandRecurringOccurrences,
  isStaffVisibleShiftStatus,
  layoutShiftBars,
  occurrenceSlotKey,
} from "./recurrence.ts";

describe("expandRecurringOccurrences — weekly MWF in America/Denver", () => {
  it("Sunday 10am Denver seed + MWF materializes Monday this week (not UTC getDay)", () => {
    // Sunday Aug 30 2026 10:00 MDT = 16:00 UTC. UTC getDay is still Sunday,
    // but evening seeds used to flip weekday on a UTC server.
    const seedStart = denverWallToIso("2026-08-30", 10, 0);
    const seedEnd = denverWallToIso("2026-08-30", 15, 0);
    const occ = expandRecurringOccurrences({
      seedStartIso: seedStart,
      seedEndIso: seedEnd,
      freq: "weekly",
      weekdays: [1, 3, 5],
      count: 4,
    });
    assert.equal(occ[0]?.ymd, "2026-08-31");
    assert.equal(denverYmd(new Date(occ[0]!.startsAt)), "2026-08-31");
    assert.deepEqual(denverHourMinute(occ[0]!.startsAt), { h: 10, m: 0 });
    assert.deepEqual(denverHourMinute(occ[0]!.endsAt), { h: 15, m: 0 });
    assert.deepEqual(occ.map((o) => o.ymd), [
      "2026-08-31",
      "2026-09-02",
      "2026-09-04",
      "2026-09-07",
    ]);
  });

  it("Monday 10am Denver seed + MWF does not duplicate the seed Monday", () => {
    const seedStart = denverWallToIso("2026-08-31", 10, 0);
    const seedEnd = denverWallToIso("2026-08-31", 15, 0);
    const occ = expandRecurringOccurrences({
      seedStartIso: seedStart,
      seedEndIso: seedEnd,
      freq: "weekly",
      weekdays: [1, 3, 5],
      count: 3,
    });
    assert.ok(!occ.some((o) => o.ymd === "2026-08-31"));
    assert.deepEqual(occ.map((o) => o.ymd), ["2026-09-02", "2026-09-04", "2026-09-07"]);
  });

  it("Sunday 10pm Denver seed is still Sunday (UTC is already Monday)", () => {
    // 22:00 MDT Sunday Aug 30 = 04:00 UTC Monday Aug 31. UTC getDay() === 1.
    const seedStart = denverWallToIso("2026-08-30", 22, 0);
    const seedEnd = denverWallToIso("2026-08-30", 23, 0);
    const occ = expandRecurringOccurrences({
      seedStartIso: seedStart,
      seedEndIso: seedEnd,
      freq: "weekly",
      weekdays: [1, 3, 5],
      count: 1,
    });
    assert.equal(occ[0]?.ymd, "2026-08-31");
    assert.deepEqual(denverHourMinute(occ[0]!.startsAt), { h: 22, m: 0 });
  });
});

describe("staff schedule visibility", () => {
  it("shows draft and published assigned shifts; hides cancelled", () => {
    assert.equal(isStaffVisibleShiftStatus("draft"), true);
    assert.equal(isStaffVisibleShiftStatus("published"), true);
    assert.equal(isStaffVisibleShiftStatus("accepted"), true);
    assert.equal(isStaffVisibleShiftStatus("cancelled"), false);
  });
});

describe("layoutShiftBars", () => {
  it("collapses identical staff+time rows so labels are not painted twice", () => {
    const a = {
      id: "1",
      staff_id: "dane",
      starts_at: "2026-08-31T16:00:00.000Z",
      ends_at: "2026-08-31T21:00:00.000Z",
    };
    const clone = { ...a, id: "2" };
    const bars = layoutShiftBars([a, clone]);
    assert.equal(bars.length, 1);
    assert.equal(bars[0]!.id, "1");
    assert.equal(bars[0]!.lanes, 1);
  });

  it("stacks overlapping different staff (2:1) on separate lanes", () => {
    const a = {
      id: "1",
      staff_id: "dane",
      starts_at: "2026-08-31T16:00:00.000Z",
      ends_at: "2026-08-31T21:00:00.000Z",
    };
    const b = {
      id: "2",
      staff_id: "other",
      starts_at: "2026-08-31T16:00:00.000Z",
      ends_at: "2026-08-31T21:00:00.000Z",
    };
    const bars = layoutShiftBars([a, b]);
    assert.equal(bars.length, 2);
    assert.equal(bars[0]!.lanes, 2);
    assert.notEqual(bars[0]!.lane, bars[1]!.lane);
  });
});

describe("denverWeekUtcBounds", () => {
  it("covers a full Denver Monday–Sunday even when ISO is Monday 06:00Z", () => {
    const bounds = denverWeekUtcBounds("2026-08-31T06:00:00.000Z");
    assert.equal(denverYmd(new Date(bounds.startIso)), "2026-08-31");
    assert.equal(denverYmd(new Date(bounds.endExclusiveIso)), "2026-09-07");
    // Monday 10am Denver is inside the week.
    const mondayTen = Date.parse(denverWallToIso("2026-08-31", 10, 0));
    assert.ok(mondayTen >= Date.parse(bounds.startIso));
    assert.ok(mondayTen < Date.parse(bounds.endExclusiveIso));
  });
});

describe("occurrenceSlotKey", () => {
  it("treats the same Denver wall-clock as one slot", () => {
    const a = denverWallToIso("2026-08-31", 10, 0);
    const b = new Date(Date.parse(a)).toISOString();
    assert.equal(
      occurrenceSlotKey("staff", "client", a),
      occurrenceSlotKey("staff", "client", b),
    );
    assert.equal(addDaysYmd("2026-08-31", 1), "2026-09-01");
  });
});
