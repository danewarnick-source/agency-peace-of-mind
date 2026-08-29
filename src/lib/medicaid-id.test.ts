import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayMedicaidId } from "./medicaid-id.ts";

describe("displayMedicaidId — same string as the client header", () => {
  it("keeps Tommy Jones leading-zero Medicaid ID", () => {
    assert.equal(displayMedicaidId("071235926"), "071235926");
    assert.equal(displayMedicaidId(71235926), "71235926");
  });

  it("does not pass empty or missing as a dash source", () => {
    assert.equal(displayMedicaidId(null), null);
    assert.equal(displayMedicaidId(undefined), null);
    assert.equal(displayMedicaidId("   "), null);
  });
});
