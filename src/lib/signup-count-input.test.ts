import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNUP_CLIENT_COUNT_ERROR,
  SIGNUP_STAFF_COUNT_ERROR,
  parseSignupClientCount,
  parseSignupStaffCount,
  signupCountDraftFromInput,
} from "./signup-count-input.ts";

describe("signupCountDraftFromInput", () => {
  it("allows empty so the field can be cleared while typing", () => {
    assert.equal(signupCountDraftFromInput(""), "");
    assert.equal(signupCountDraftFromInput("   "), "");
  });

  it("keeps single digits and multi-digit counts", () => {
    assert.equal(signupCountDraftFromInput("1"), "1");
    assert.equal(signupCountDraftFromInput("9"), "9");
    assert.equal(signupCountDraftFromInput("12"), "12");
  });

  it("strips non-digits without forcing a minimum", () => {
    assert.equal(signupCountDraftFromInput("12a"), "12");
    assert.equal(signupCountDraftFromInput("e"), "");
  });
});

describe("parseSignupStaffCount", () => {
  it("requires a positive integer ≥ 1 (clampStaffCount min)", () => {
    assert.deepEqual(parseSignupStaffCount(""), { ok: false, error: SIGNUP_STAFF_COUNT_ERROR });
    assert.deepEqual(parseSignupStaffCount("0"), { ok: false, error: SIGNUP_STAFF_COUNT_ERROR });
    assert.deepEqual(parseSignupStaffCount("1"), { ok: true, value: 1 });
    assert.deepEqual(parseSignupStaffCount("8"), { ok: true, value: 8 });
  });

  it("clamps to the existing 500 staff max", () => {
    assert.deepEqual(parseSignupStaffCount("500"), { ok: true, value: 500 });
    assert.deepEqual(parseSignupStaffCount("501"), { ok: true, value: 500 });
  });
});

describe("parseSignupClientCount", () => {
  it("allows 0 (clampClientCount min) and rejects empty", () => {
    assert.deepEqual(parseSignupClientCount(""), { ok: false, error: SIGNUP_CLIENT_COUNT_ERROR });
    assert.deepEqual(parseSignupClientCount("0"), { ok: true, value: 0 });
    assert.deepEqual(parseSignupClientCount("1"), { ok: true, value: 1 });
    assert.deepEqual(parseSignupClientCount("12"), { ok: true, value: 12 });
  });

  it("clamps to the existing 5000 client max", () => {
    assert.deepEqual(parseSignupClientCount("5000"), { ok: true, value: 5000 });
    assert.deepEqual(parseSignupClientCount("5001"), { ok: true, value: 5000 });
  });
});
