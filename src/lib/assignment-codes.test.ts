import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowedCodesFor,
  clientAuthorizedCodes,
  defaultCaseloadCode,
  hasHostHomeDailyCode,
  isHostHomeOnlyAssignment,
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
});
