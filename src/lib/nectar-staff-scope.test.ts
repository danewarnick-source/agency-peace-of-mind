import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STAFF_PAY_HOURS_REFUSAL,
  STAFF_PAY_PERIOD_PATH,
  addYmdDays,
  buildSchedulePack,
  extractPersonTokens,
  matchNamedPerson,
  questionWantsPayOrHours,
  questionWantsSchedule,
  resolveScheduleSubject,
  scheduleQueryWindow,
  staffPayHoursRefusalReply,
} from "./nectar-staff-scope.ts";
import { denverYmdFromInstant } from "./denver-date.ts";

const johnny = { id: "c-johnny", first_name: "Johnny", last_name: "Rivera" };
const abby = { id: "c-abby", first_name: "Abby", last_name: "Chen" };
const caseload = [johnny, abby];

describe("questionWantsPayOrHours", () => {
  it("blocks pay and earnings questions", () => {
    assert.equal(questionWantsPayOrHours("what's my pay?"), true);
    assert.equal(questionWantsPayOrHours("How much did I make this period?"), true);
    assert.equal(questionWantsPayOrHours("estimated earnings"), true);
    assert.equal(questionWantsPayOrHours("what is my hourly rate"), true);
    assert.equal(questionWantsPayOrHours("overtime pay this week"), true);
  });

  it("blocks hours-worked questions including pay period", () => {
    assert.equal(questionWantsPayOrHours("how many hours did I work this pay period?"), true);
    assert.equal(questionWantsPayOrHours("How many hours have I worked this week?"), true);
    assert.equal(questionWantsPayOrHours("hours this month"), true);
    assert.equal(questionWantsPayOrHours("hours worked this period"), true);
  });

  it("does not block schedule or policy questions", () => {
    assert.equal(questionWantsPayOrHours("what's my schedule this week?"), false);
    assert.equal(questionWantsPayOrHours("when do I work with Johnny?"), false);
    assert.equal(questionWantsPayOrHours("how many shifts have I worked with Abby this month?"), false);
    assert.equal(questionWantsPayOrHours("Walk me through the reimbursement process."), false);
    assert.equal(questionWantsPayOrHours("What's the overtime policy?"), false);
  });
});

describe("questionWantsSchedule", () => {
  it("detects own-schedule and day-name questions", () => {
    assert.equal(questionWantsSchedule("what's my schedule this week?"), true);
    assert.equal(questionWantsSchedule("when do I work?"), true);
    assert.equal(questionWantsSchedule("do I work Tuesday?"), true);
    assert.equal(questionWantsSchedule("am I scheduled Friday"), true);
  });

  it("detects caseload client shift questions", () => {
    assert.equal(questionWantsSchedule("When's the next time I work with Johnny?"), true);
    assert.equal(questionWantsSchedule("How many shifts have I worked with Abby this month?"), true);
  });

  it("does not treat pay/hours as schedule", () => {
    assert.equal(questionWantsSchedule("how many hours did I work this pay period?"), false);
    assert.equal(questionWantsSchedule("what's my pay?"), false);
  });
});

describe("name resolution", () => {
  it("extracts names and initials, not day words", () => {
    const tokens = extractPersonTokens("When do I work with Johnny on Tuesday?");
    assert.deepEqual(tokens.map((t) => t.toLowerCase()), ["johnny"]);
    assert.ok(extractPersonTokens("next time with J.R.").length >= 1);
  });

  it("matches first name, nickname prefix, and initials", () => {
    assert.equal(matchNamedPerson("Johnny", caseload).status, "one");
    assert.equal(matchNamedPerson("john", caseload).status, "one");
    const jr = matchNamedPerson("JR", caseload);
    assert.equal(jr.status, "one");
    if (jr.status === "one") assert.equal(jr.person.id, "c-johnny");
  });

  it("tries me first, then caseload, then own-shift clients", () => {
    const caller = { user_id: "u-1", full_name: "Dane Warnick" };
    const self = resolveScheduleSubject("when does Dane work Tuesday?", caller, caseload, []);
    assert.equal(self.kind, "self");

    const viaCase = resolveScheduleSubject("when do I work with Johnny?", caller, caseload, []);
    assert.equal(viaCase.kind, "client");
    if (viaCase.kind === "client") {
      assert.equal(viaCase.person.id, "c-johnny");
      assert.equal(viaCase.via, "caseload");
    }

    const viaShift = resolveScheduleSubject(
      "when do I work with Abby?",
      caller,
      [johnny],
      [abby],
    );
    assert.equal(viaShift.kind, "client");
    if (viaShift.kind === "client") {
      assert.equal(viaShift.via, "own_shift");
      assert.equal(viaShift.person.id, "c-abby");
    }
  });

  it("refuses other employees and off-caseload names", () => {
    const caller = { user_id: "u-1", full_name: "Dane Warnick" };
    const miss = resolveScheduleSubject("when does Sarah work Tuesday?", caller, caseload, []);
    assert.equal(miss.kind, "unresolved");
    const off = resolveScheduleSubject("when do I work with Marcus?", caller, caseload, []);
    assert.equal(off.kind, "unresolved");
  });

  it("treats a schedule question with no name as me", () => {
    const caller = { user_id: "u-1", full_name: "Dane Warnick" };
    const sub = resolveScheduleSubject("what's my schedule this week?", caller, caseload, []);
    assert.equal(sub.kind, "self");
  });
});

describe("schedule pack + pay refusal", () => {
  it("counts and next-shift only for the caller's rows with that client", () => {
    const pack = buildSchedulePack(
      [
        {
          id: "s1",
          client_id: "c-abby",
          client_name: "Abby Chen",
          job_code: "DSI",
          starts_at: "2026-09-02T16:00:00.000Z",
          ends_at: "2026-09-02T20:00:00.000Z",
        },
        {
          id: "s2",
          client_id: "c-abby",
          client_name: "Abby Chen",
          job_code: "DSI",
          starts_at: "2026-09-15T16:00:00.000Z",
          ends_at: "2026-09-15T20:00:00.000Z",
        },
        {
          id: "s3",
          client_id: "c-johnny",
          client_name: "Johnny Rivera",
          job_code: "SEI",
          starts_at: "2026-09-15T17:00:00.000Z",
          ends_at: "2026-09-15T19:00:00.000Z",
        },
      ],
      new Date("2026-09-09T18:00:00.000Z"),
      "c-abby",
    );
    assert.equal(pack.shifts_this_month_with_client, 2);
    assert.equal(pack.next_with_client?.id, "s2");
    assert.equal(pack.upcoming.every((s) => s.client_id === "c-abby"), true);
  });

  it("pay refusal points at the existing Caseload pay-period route", () => {
    const reply = staffPayHoursRefusalReply();
    assert.equal(reply.refused, true);
    assert.equal(reply.answer, STAFF_PAY_HOURS_REFUSAL);
    assert.equal(reply.deepLink.path, STAFF_PAY_PERIOD_PATH);
    assert.equal(STAFF_PAY_PERIOD_PATH, "/dashboard");
    assert.match(reply.answer, /Caseload/);
    assert.doesNotMatch(reply.answer, /Hive/i);
  });

  it("adds calendar days on a YMD without inventing UTC drift", () => {
    assert.equal(addYmdDays("2026-09-09", 21), "2026-09-30");
    assert.equal(addYmdDays("2026-09-01", -1), "2026-08-31");
  });
});

describe("scheduleQueryWindow", () => {
  it("uses Denver month-start through 21 days ahead", () => {
    const w = scheduleQueryWindow(new Date("2026-09-09T18:00:00.000Z"));
    assert.equal(denverYmdFromInstant(w.fromIso), "2026-09-01");
    assert.equal(denverYmdFromInstant(w.toIso), "2026-10-01");
  });
});
