import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("queue source failures are not a clean zero", () => {
  it("rethrows live source errors and records a gap item", () => {
    const src = readFileSync(new URL("../hooks/use-action-required-queue.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /return \[\];/);
    assert.match(src, /if \(error\) throw error/);
    assert.match(src, /queue-check-failed/);
    assert.match(src, /sourceFailed/);
    assert.doesNotMatch(src, /getStaffChecklist/);
  });
});
