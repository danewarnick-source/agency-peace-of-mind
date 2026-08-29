import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stableActionRequiredCount } from "./action-required-count.ts";

describe("stableActionRequiredCount", () => {
  it("holds at 0 while any queue source is still loading", () => {
    assert.equal(stableActionRequiredCount(true, 1), 0);
    assert.equal(stableActionRequiredCount(true, 15), 0);
  });

  it("publishes the full count only after every source has settled", () => {
    assert.equal(stableActionRequiredCount(false, 15), 15);
    assert.equal(stableActionRequiredCount(false, 0), 0);
  });
});
