import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskMemberId, padMemberId } from "./evv-codes.ts";

describe("maskMemberId", () => {
  it("shows only the last 4 characters", () => {
    assert.equal(maskMemberId("1234567890"), "****7890");
    assert.equal(maskMemberId("0001234567"), "****4567");
  });

  it("pads short ids before masking", () => {
    assert.equal(padMemberId("89"), "0000000089");
    assert.equal(maskMemberId("89"), "****0089");
  });

  it("returns empty for missing values", () => {
    assert.equal(maskMemberId(null), "");
    assert.equal(maskMemberId(""), "");
    assert.equal(maskMemberId("   "), "");
  });
});
