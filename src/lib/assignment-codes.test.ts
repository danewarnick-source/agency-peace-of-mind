import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedCodesFor,
  caseloadCardActions,
  caseloadDailyNoteLabel,
  caseloadTimeClockLabel,
  clientAuthorizedCodes,
  defaultCaseloadCode,
  firstClockableCode,
  hasHhsCode,
  hasHostHomeDailyCode,
  hostHomeDailyNoteCode,
  isDualHhsAndClockable,
  isHostHomeDailyNoteCard,
  isHostHomeOnlyAssignment,
  stackDualCaseloadActions,
  type AssignmentMap,
} from "./assignment-codes.ts";

describe("clientAuthorizedCodes", () => {
  it("uses authorized_dspd_codes when job_code is empty (Stephen / SLH)", () => {
    assert.deepEqual(
      clientAuthorizedCodes({ job_code: null, authorized_dspd_codes: ["SLH"] }),
      ["SLH"],
    );
    assert.deepEqual(
      clientAuthorizedCodes({ job_code: [], authorized_dspd_codes: ["SLH"] }),
      ["SLH"],
    );
  });

  it("unions authorized + job_code without dupes", () => {
    assert.deepEqual(
      clientAuthorizedCodes({
        authorized_dspd_codes: ["SLH", "DSI"],
        job_code: ["dsi", "HHS"],
      }),
      ["SLH", "DSI", "HHS"],
    );
  });
});

describe("allowedCodesFor — null service_codes means all client codes", () => {
  it("falls back to authorized codes when assignment.service_codes is null", () => {
    const map: AssignmentMap = new Map([
      ["client-stephen", null],
    ]);
    const clientCodes = clientAuthorizedCodes({
      job_code: null,
      authorized_dspd_codes: ["SLH"],
    });
    assert.deepEqual(allowedCodesFor(map, "client-stephen", clientCodes), ["SLH"]);
  });

  it("returns [] when the staff has no assignment row", () => {
    const map: AssignmentMap = new Map();
    assert.deepEqual(allowedCodesFor(map, "client-stephen", ["SLH"]), []);
  });

  it("restricts when service_codes is an explicit list", () => {
    const map: AssignmentMap = new Map([
      ["client-stephen", new Set(["DSI"])],
    ]);
    assert.deepEqual(
      allowedCodesFor(map, "client-stephen", ["SLH", "DSI"]),
      ["DSI"],
    );
  });
});

describe("defaultCaseloadCode — do not invent SEI", () => {
  it("uses HHS when that is the authorized code", () => {
    assert.equal(defaultCaseloadCode([], ["HHS"]), "HHS");
  });

  it("does not fall back to SEI when no codes are listed", () => {
    assert.equal(defaultCaseloadCode([], []), "");
    assert.notEqual(defaultCaseloadCode([], []), "SEI");
  });

  it("prefers the assignment list", () => {
    assert.equal(defaultCaseloadCode(["HHS"], ["HHS", "DSI"]), "HHS");
  });
});

describe("host-home daily assignment", () => {
  it("treats HHS as host-home daily", () => {
    assert.equal(hasHostHomeDailyCode(["HHS"]), true);
    assert.equal(isHostHomeOnlyAssignment(["HHS"]), true);
  });

  it("does not treat mixed HHS + clockable as host-only", () => {
    assert.equal(hasHostHomeDailyCode(["HHS", "DSI"]), true);
    assert.equal(isHostHomeOnlyAssignment(["HHS", "DSI"]), false);
  });

  it("treats clockable-only as not host-home", () => {
    assert.equal(hasHostHomeDailyCode(["SLH"]), false);
    assert.equal(isHostHomeOnlyAssignment(["SLH"]), false);
  });

  it("flags HHS + DSI as dual codes on file — not as punch-on-host-home", () => {
    assert.equal(hasHhsCode(["HHS", "DSI"]), true);
    assert.equal(firstClockableCode(["HHS", "DSI"]), "DSI");
    assert.equal(isDualHhsAndClockable(["HHS", "DSI"]), true);
    assert.equal(isDualHhsAndClockable(["HHS"]), false);
    assert.equal(isDualHhsAndClockable(["DSI"]), false);
    assert.equal(isDualHhsAndClockable(["HHS", "SLH", "SEI"]), true);
  });

  it("treats Tommy-style HHS + DSI/SEI/SLH with no clockable shift today as host-home only", () => {
    const tommy = ["DSI", "HHS", "SEI", "SLH"];
    assert.equal(isDualHhsAndClockable(tommy), true);
    assert.equal(
      isHostHomeDailyNoteCard({ codes: tommy, todayJobCode: null, isOnTheClock: false }),
      true,
    );
    assert.deepEqual(caseloadCardActions({ codes: tommy, isOnTheClock: false }), {
      showDailyNote: true,
      showTimeClock: false,
    });
    assert.equal(
      stackDualCaseloadActions({
        codes: tommy,
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: false,
        isOnTheClock: false,
      }),
      false,
    );
  });

  it("HHS+DSI on file, no open punch → daily note only (even with a scheduled DSI shift)", () => {
    const codes = ["HHS", "DSI"];
    assert.equal(
      isHostHomeDailyNoteCard({ codes, todayJobCode: "DSI", isOnTheClock: false }),
      true,
    );
    assert.deepEqual(
      caseloadCardActions({ codes, isOnTheClock: false, hasClockableShiftToday: true }),
      { showDailyNote: true, showTimeClock: false },
    );
    assert.equal(
      stackDualCaseloadActions({
        codes,
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: true,
        isOnTheClock: false,
      }),
      false,
    );
    assert.equal(caseloadDailyNoteLabel({ code: "HHS" }), "Open daily note (HHS)");
  });

  it("HHS + open DSI punch → daily note (HHS) + open time clock (DSI)", () => {
    const codes = ["HHS", "DSI"];
    assert.equal(
      isHostHomeDailyNoteCard({ codes, todayJobCode: "DSI", isOnTheClock: true }),
      false,
    );
    assert.deepEqual(caseloadCardActions({ codes, isOnTheClock: true }), {
      showDailyNote: true,
      showTimeClock: true,
    });
    assert.equal(
      stackDualCaseloadActions({
        codes,
        isHostHomeDailyNoteCard: false,
        hasClockableShiftToday: false,
        isOnTheClock: true,
      }),
      true,
    );
    assert.equal(hostHomeDailyNoteCode(codes), "HHS");
    assert.equal(caseloadDailyNoteLabel({ code: "HHS" }), "Open daily note (HHS)");
    assert.equal(
      caseloadDailyNoteLabel({ code: "HHS", alreadyDoneToday: true }),
      "Complete daily note (HHS)",
    );
    assert.equal(caseloadTimeClockLabel("DSI"), "End shift (DSI)");
  });

  it("clockable-only with no open punch → no Open Punch pad on the card", () => {
    assert.equal(
      isHostHomeDailyNoteCard({ codes: ["DSI"], todayJobCode: "DSI", isOnTheClock: false }),
      false,
    );
    assert.deepEqual(
      caseloadCardActions({
        codes: ["DSI"],
        isOnTheClock: false,
        hasClockableShiftToday: true,
      }),
      { showDailyNote: false, showTimeClock: false },
    );
    assert.equal(
      stackDualCaseloadActions({
        codes: ["DSI"],
        isHostHomeDailyNoteCard: false,
        hasClockableShiftToday: true,
        isOnTheClock: false,
      }),
      false,
    );
  });

  it("clockable-only with an open punch → time clock only, labeled with that punch code", () => {
    assert.deepEqual(caseloadCardActions({ codes: ["SLH"], isOnTheClock: true }), {
      showDailyNote: false,
      showTimeClock: true,
    });
    assert.equal(caseloadTimeClockLabel("SLH"), "End shift (SLH)");
  });

  it("never stacks a start-punch button onto a host-home daily-note card", () => {
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS", "DSI"],
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: false,
        isOnTheClock: false,
      }),
      false,
    );
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS", "DSI"],
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: true,
        isOnTheClock: false,
      }),
      false,
    );
  });

  it("leaves HHS-only as daily note only until they are on the clock", () => {
    assert.equal(
      isHostHomeDailyNoteCard({ codes: ["HHS"], todayJobCode: "HHS", isOnTheClock: false }),
      true,
    );
    assert.deepEqual(caseloadCardActions({ codes: ["HHS"], isOnTheClock: false }), {
      showDailyNote: true,
      showTimeClock: false,
    });
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS"],
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: false,
        isOnTheClock: false,
      }),
      false,
    );
    assert.deepEqual(caseloadCardActions({ codes: ["HHS", "SEI"], isOnTheClock: true }), {
      showDailyNote: true,
      showTimeClock: true,
    });
  });
});
