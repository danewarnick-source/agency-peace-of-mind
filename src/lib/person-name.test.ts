import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayPersonName, toDisplayNameCase } from "./person-name.ts";

describe("toDisplayNameCase — display layer only", () => {
  it("title-cases ALL CAPS imports", () => {
    assert.equal(toDisplayNameCase("STEPHEN PRINCE"), "Stephen Prince");
    assert.equal(displayPersonName("STEPHEN", "PRINCE"), "Stephen Prince");
  });

  it("preserves already mixed-case legal names", () => {
    assert.equal(toDisplayNameCase("Tommy Jones"), "Tommy Jones");
    assert.equal(displayPersonName("Tommy", "Jones"), "Tommy Jones");
    assert.equal(toDisplayNameCase("McDonald"), "McDonald");
  });

  it("handles hyphens, apostrophes, and suffixes", () => {
    assert.equal(toDisplayNameCase("MARY-JANE O'BRIEN JR"), "Mary-Jane O'Brien JR");
    assert.equal(toDisplayNameCase("MCDONALD"), "McDonald");
  });
});
