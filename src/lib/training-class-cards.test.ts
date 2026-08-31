import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classCardLabel, classCardSummary, rosterCardStatus } from "./training-class-cards.ts";

describe("class completion cards", () => {
  it("treats an uploaded path or timestamp as card in", () => {
    assert.equal(rosterCardStatus({}), "missing");
    assert.equal(rosterCardStatus({ cardPath: "org/class/card.pdf" }), "in");
    assert.equal(rosterCardStatus({ cardUploadedAt: "2026-08-31T00:00:00Z" }), "in");
  });

  it("summarizes whether the class card is in", () => {
    const mixed = classCardSummary([{ cardStatus: "in" }, { cardStatus: "missing" }]);
    assert.equal(mixed.inCount, 1);
    assert.equal(mixed.missingCount, 1);
    assert.equal(mixed.allIn, false);
    assert.equal(classCardLabel(mixed), "1 of 2 cards in");
    assert.equal(classCardLabel(classCardSummary([{ cardStatus: "in" }])), "Card in");
    assert.equal(classCardLabel(classCardSummary([{ cardStatus: "missing" }])), "Card not in");
  });
});
