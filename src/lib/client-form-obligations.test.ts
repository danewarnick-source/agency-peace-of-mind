import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_SPECIFIC_OBLIGATION_TITLE,
  PCT_CLIENT_OBLIGATION_TITLE,
  PCT_HIRE_COURSE_TITLE,
  SEI_SUPPORT_STRATEGIES_UPI_TITLE,
  SUPPORT_STRATEGIES_OBLIGATION_TITLE,
  clientFormKindForTitle,
  clientFormTitleForKind,
  isClientFormObligationTitle,
} from "./client-form-obligations.ts";

describe("clientFormKindForTitle", () => {
  it("maps the three per-client form duties", () => {
    assert.equal(clientFormKindForTitle(CLIENT_SPECIFIC_OBLIGATION_TITLE), "person_specific");
    assert.equal(clientFormKindForTitle("Client-Specific Training — Jane Doe"), "person_specific");
    assert.equal(clientFormKindForTitle(SUPPORT_STRATEGIES_OBLIGATION_TITLE), "support_strategies");
    assert.equal(clientFormKindForTitle("Support Strategies — Jane Doe"), "support_strategies");
    assert.equal(clientFormKindForTitle(PCT_CLIENT_OBLIGATION_TITLE), "person_centered");
    assert.equal(clientFormKindForTitle("Person-Centered Thinking — Jane Doe"), "person_centered");
  });

  it("does not treat the hire-level PCT course as the per-client form", () => {
    assert.equal(clientFormKindForTitle(PCT_HIRE_COURSE_TITLE), null);
    assert.equal(isClientFormObligationTitle(PCT_HIRE_COURSE_TITLE), false);
  });

  it("does not treat SEI UPI support-strategy entry as the staff form", () => {
    assert.equal(clientFormKindForTitle(SEI_SUPPORT_STRATEGIES_UPI_TITLE), null);
    assert.equal(isClientFormObligationTitle(SEI_SUPPORT_STRATEGIES_UPI_TITLE), false);
  });

  it("round-trips kind → catalog title", () => {
    assert.equal(clientFormKindForTitle(clientFormTitleForKind("person_specific")), "person_specific");
    assert.equal(
      clientFormKindForTitle(clientFormTitleForKind("support_strategies")),
      "support_strategies",
    );
    assert.equal(clientFormKindForTitle(clientFormTitleForKind("person_centered")), "person_centered");
  });
});
