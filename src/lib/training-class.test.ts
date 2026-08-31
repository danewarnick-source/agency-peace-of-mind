import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRAINING_PRICE_CENTS } from "./hive-pricing.ts";
import {
  cleanRosterRows,
  mergeSelectedMembersIntoRoster,
  quoteTrainingClass,
  trainingClassIsExternal,
  trainingClassSku,
  trainingClassUnitCents,
  trainingClassUnitCentsFromCatalog,
  validateRosterRows,
} from "./training-class.ts";

describe("locked training class prices", () => {
  it("charges CPR $100, 30-day $75, Mandt $200, package $300 per seat", () => {
    assert.equal(trainingClassUnitCents("cpr_first_aid"), 10_000);
    assert.equal(trainingClassUnitCents("thirty_day"), 7_500);
    assert.equal(trainingClassUnitCents("mandt"), 20_000);
    assert.equal(trainingClassUnitCents("package"), 30_000);
    assert.equal(TRAINING_PRICE_CENTS.cpr_first_aid, 10_000);
    assert.equal(TRAINING_PRICE_CENTS.thirty_day, 7_500);
    assert.equal(TRAINING_PRICE_CENTS.dspd_required, 7_500);
    assert.equal(TRAINING_PRICE_CENTS.mandt, 20_000);
    assert.equal(TRAINING_PRICE_CENTS.full_program, 30_000);
  });

  it("package saves $75 versus buying the three seats separately", () => {
    const ala = 10_000 + 7_500 + 20_000;
    assert.equal(ala - TRAINING_PRICE_CENTS.full_program, 7_500);
  });

  it("True North / exempt is always $0", () => {
    const q = quoteTrainingClass("package", 4, true);
    assert.equal(q.unitCents, 0);
    assert.equal(q.totalCents, 0);
    assert.equal(q.seatCount, 4);
  });

  it("paying orgs are charged per seat", () => {
    const q = quoteTrainingClass("cpr_first_aid", 3, false);
    assert.equal(q.totalCents, 30_000);
    assert.equal(q.isExternalClass, true);
  });

  it("30-day is not an external class", () => {
    assert.equal(trainingClassIsExternal("thirty_day"), false);
    assert.equal(trainingClassIsExternal("cpr_first_aid"), true);
    assert.equal(trainingClassIsExternal("mandt"), true);
    assert.equal(trainingClassIsExternal("package"), true);
  });

  it("maps class types to catalog SKUs and ignores stale catalog cents", () => {
    assert.equal(trainingClassSku("thirty_day"), "dspd_required");
    assert.equal(trainingClassSku("package"), "full_program");
    assert.equal(trainingClassUnitCentsFromCatalog("cpr_first_aid", 7_500), 10_000);
    assert.equal(trainingClassUnitCentsFromCatalog("thirty_day", 10_000), 7_500);
    assert.equal(trainingClassUnitCentsFromCatalog("mandt", 0), 20_000);
  });
});

describe("roster multi-select merge", () => {
  const team = [
    { id: "a", label: "Ada", email: "ada@hive.test", phone: "801-555-0100" },
    { id: "b", label: "Bea", email: "bea@hive.test", phone: "801-555-0101" },
    { id: "c", label: "Cal", email: "cal@hive.test", phone: "801-555-0102" },
  ];

  it("adds every selected staff in one pass", () => {
    const next = mergeSelectedMembersIntoRoster(
      [{ name: "", email: "", phone: "", staffUserId: null }],
      team,
      ["a", "c"],
    );
    assert.equal(next.length, 2);
    assert.deepEqual(
      next.map((r) => r.email),
      ["ada@hive.test", "cal@hive.test"],
    );
  });

  it("skips people already on the roster", () => {
    const next = mergeSelectedMembersIntoRoster(
      [{ name: "Ada", email: "ada@hive.test", phone: "1", staffUserId: "a" }],
      team,
      ["a", "b"],
    );
    assert.equal(next.length, 2);
    assert.equal(next[1]?.email, "bea@hive.test");
  });
});

describe("roster validation", () => {
  it("requires name, email, and phone on every row", () => {
    assert.equal(
      validateRosterRows([{ name: "Ada", email: "ada@hive.test", phone: "801-555-0100" }]),
      null,
    );
    assert.match(validateRosterRows([]), /at least one/i);
    assert.match(
      validateRosterRows([{ name: "", email: "ada@hive.test", phone: "801-555-0100" }]),
      /name/i,
    );
    assert.match(
      validateRosterRows([{ name: "Ada", email: "not-an-email", phone: "801-555-0100" }]),
      /email/i,
    );
    assert.match(
      validateRosterRows([{ name: "Ada", email: "ada@hive.test", phone: "" }]),
      /phone/i,
    );
  });

  it("rejects duplicate emails after trim/lowercase", () => {
    const rows = cleanRosterRows([
      { name: " Ada ", email: "Ada@Hive.Test", phone: "1" },
      { name: "Ada 2", email: "ada@hive.test", phone: "2" },
    ]);
    assert.match(validateRosterRows(rows), /twice/i);
  });
});
