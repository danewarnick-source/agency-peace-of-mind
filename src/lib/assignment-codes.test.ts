import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedCodesFor,
  clientAuthorizedCodes,
  defaultCaseloadCode,
  firstClockableCode,
  hasHhsCode,
  hasHostHomeDailyCode,
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

  it("never stacks Punch pad onto a host-home daily-note card", () => {
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS", "DSI"],
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: false,
        isOnTheClock: false,
      }),
      false,
    );
    // Even if a clockable shift exists elsewhere, the HHS card itself stays daily-note only.
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

  it("puts punch on a separate clockable row / in-progress punch, not on HHS", () => {
    assert.equal(
      isHostHomeDailyNoteCard({
        codes: ["HHS", "DSI"],
        todayJobCode: "DSI",
        isOnTheClock: false,
      }),
      false,
    );
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS", "DSI"],
        isHostHomeDailyNoteCard: false,
        hasClockableShiftToday: true,
        isOnTheClock: false,
      }),
      true,
    );
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS", "DSI"],
        isHostHomeDailyNoteCard: false,
        hasClockableShiftToday: false,
        isOnTheClock: true,
      }),
      true,
    );
  });

  it("leaves HHS-only and clockable-only unchanged", () => {
    assert.equal(
      isHostHomeDailyNoteCard({ codes: ["HHS"], todayJobCode: "HHS", isOnTheClock: false }),
      true,
    );
    assert.equal(
      stackDualCaseloadActions({
        codes: ["HHS"],
        isHostHomeDailyNoteCard: true,
        hasClockableShiftToday: false,
        isOnTheClock: false,
      }),
      false,
    );
    assert.equal(
      isHostHomeDailyNoteCard({ codes: ["DSI"], todayJobCode: "DSI", isOnTheClock: false }),
      false,
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
});
