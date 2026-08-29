import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindSpecialDirections } from "./bind-special-directions.ts";

describe("bindSpecialDirections", () => {
  it("substitutes placeholders with the page client", () => {
    assert.equal(
      bindSpecialDirections("Do not leave [First Name] unattended.", { first_name: "Avery", last_name: "Quinn" }),
      "Do not leave Avery unattended.",
    );
    assert.equal(
      bindSpecialDirections("Support [Client Name] at meals.", { first_name: "Avery", last_name: "Quinn" }),
      "Support Avery Quinn at meals.",
    );
  });

  it("leaves plain text unchanged", () => {
    assert.equal(
      bindSpecialDirections("Choking risk — sit upright.", { first_name: "Avery", last_name: "Quinn" }),
      "Choking risk — sit upright.",
    );
  });

  it("returns empty for missing copy", () => {
    assert.equal(bindSpecialDirections(null, { first_name: "Avery" }), "");
  });
});
