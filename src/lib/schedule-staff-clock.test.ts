import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCHEDULE_NON_CLIENT_CLOCK_IN_TITLE,
  SCHEDULE_NON_CLIENT_HELPER,
  SCHEDULE_NON_CLIENT_SECTION,
  scheduleGroupRowCta,
  scheduleHasOpenPunch,
  scheduleNonClientClockInAllowed,
  scheduleShiftCta,
  scheduleShiftOpensPunchPad,
  scheduleStaffHidesStatusBadge,
} from "./schedule-staff-clock.ts";

describe("scheduleHasOpenPunch", () => {
  it("is true for a client EVV punch or a general punch", () => {
    assert.equal(scheduleHasOpenPunch({ id: "ts-1" }, null), true);
    assert.equal(scheduleHasOpenPunch(null, { id: "gen-1" }), true);
    assert.equal(scheduleHasOpenPunch({ id: "ts-1" }, { id: "gen-1" }), true);
  });

  it("is false when nothing is open", () => {
    assert.equal(scheduleHasOpenPunch(null, null), false);
    assert.equal(scheduleHasOpenPunch(undefined, undefined), false);
  });
});

describe("schedule shift cards never clock in", () => {
  it("never deep-links a card to the punch pad", () => {
    assert.equal(scheduleShiftOpensPunchPad({ hasOpenPunch: false, daily: false }), false);
    assert.equal(scheduleShiftOpensPunchPad({ hasOpenPunch: true, daily: false }), false);
    assert.equal(scheduleShiftOpensPunchPad({ hasOpenPunch: false, daily: true }), false);
  });

  it("never paints Open Time Clock on Day/Week/Month cards", () => {
    assert.equal(scheduleShiftCta({ hasOpenPunch: false, daily: false }), null);
    assert.equal(scheduleShiftCta({ hasOpenPunch: true, daily: false }), null);
    assert.equal(scheduleGroupRowCta({ hasOpenPunch: false, daily: false }), null);
    assert.equal(scheduleGroupRowCta({ hasOpenPunch: true, daily: true }), null);
  });
});

describe("schedule staff DRAFT badge", () => {
  it("hides draft and keeps other statuses", () => {
    assert.equal(scheduleStaffHidesStatusBadge("draft"), true);
    assert.equal(scheduleStaffHidesStatusBadge("DRAFT"), true);
    assert.equal(scheduleStaffHidesStatusBadge(" accepted"), false);
    assert.equal(scheduleStaffHidesStatusBadge("pending"), false);
    assert.equal(scheduleStaffHidesStatusBadge(null), false);
  });
});

describe("schedule non-client extra clock", () => {
  it("cannot start another punch while one is open", () => {
    assert.equal(scheduleNonClientClockInAllowed(true), false);
    assert.equal(scheduleNonClientClockInAllowed(false), true);
  });

  it("locked staff copy", () => {
    assert.equal(SCHEDULE_NON_CLIENT_SECTION, "Not with a client");
    assert.equal(SCHEDULE_NON_CLIENT_CLOCK_IN_TITLE, "Clock in");
    assert.equal(
      SCHEDULE_NON_CLIENT_HELPER,
      "Working, but not at a client's home.",
    );
  });
});

describe("staff Schedule page source", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../routes/dashboard.schedule.tsx", import.meta.url)),
    "utf8",
  );

  it("gates the extra clock when an open punch exists", () => {
    assert.match(src, /useActiveShift/);
    assert.match(src, /scheduleNonClientClockInAllowed/);
    assert.match(src, /scheduleStaffHidesStatusBadge/);
  });

  it("uses Tony's non-client labels and drops NO EVV / Open Time Clock / DRAFT CTA leftovers", () => {
    assert.match(src, /SCHEDULE_NON_CLIENT_SECTION/);
    assert.match(src, /SCHEDULE_NON_CLIENT_CLOCK_IN_TITLE/);
    assert.match(src, /SCHEDULE_NON_CLIENT_HELPER/);
    assert.doesNotMatch(src, /Time Clock — Clock In/);
    assert.doesNotMatch(src, /Open Time Clock/);
    assert.doesNotMatch(src, /tab: "clock-in"/);
    assert.doesNotMatch(src, /NO EVV/);
    assert.doesNotMatch(src, /no EVV/);
  });
});

describe("Request time off dialog", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../components/schedule-preview/request-time-off-dialog.tsx", import.meta.url)),
    "utf8",
  );

  it("shows the existing form and does not auto-open the calendar", () => {
    assert.match(src, /Start date/);
    assert.match(src, /End date/);
    assert.match(src, /onOpenAutoFocus/);
    assert.match(src, /e\.preventDefault\(\)/);
    assert.doesNotMatch(src, /autoFocus=\{true\}/);
    assert.doesNotMatch(src, /partial-day|urgency|manager picker|hours balance/i);
  });
});
